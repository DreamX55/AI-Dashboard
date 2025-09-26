from __future__ import annotations

import io
import os
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# -----------------------------
# App & Config
# -----------------------------
app = FastAPI(title="AI Shipment Analysis API")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
CHARTS_DIR = os.path.join(STATIC_DIR, "charts")
os.makedirs(CHARTS_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# -----------------------------
# In-memory Data Store
# -----------------------------
DATAFRAME: Optional[pd.DataFrame] = None

REQUIRED_COLUMNS = [
    "GrossQuantity",
    "FlowRate",
    "ShipmentCompartmentID",
    "BaseProductID",
    "BaseProductCode",
    "ShipmentID",
    "ShipmentCode",
    "ExitTime",
    "BayCode",
    "ScheduledDate",
    "CreatedTime",
]

DATETIME_COLUMNS = ["ExitTime", "ScheduledDate", "CreatedTime"]


# -----------------------------
# Helpers
# -----------------------------
def parse_csv_to_dataframe(file_bytes: bytes) -> pd.DataFrame:
    buffer = io.BytesIO(file_bytes)
    df = pd.read_csv(buffer)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing}")

    for col in DATETIME_COLUMNS:
        df[col] = pd.to_datetime(df[col], errors="coerce")

    # Coerce numerics
    for col in ["GrossQuantity", "FlowRate"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Basic cleaning: drop fully empty rows in key columns
    df = df.dropna(subset=["GrossQuantity", "ShipmentID", "ExitTime"], how="any")
    df = df.reset_index(drop=True)
    return df


def save_plot_return_url(fig, filename_prefix: str) -> str:
    fig.tight_layout()
    file_id = f"{filename_prefix}_{uuid.uuid4().hex[:8]}.png"
    path = os.path.join(CHARTS_DIR, file_id)
    fig.savefig(path)
    plt.close(fig)
    return f"/static/charts/{file_id}"


def classify_query_intent(query: str) -> str:
    q = query.lower()
    if any(k in q for k in ["forecast", "predict", "projection", "next "]):
        return "forecast"
    if any(k in q for k in ["trend", "over time", "time series", "by day", "by month", "chart", "plot", "graph"]):
        return "trend"
    return "analysis"


def answer_with_rules(df: pd.DataFrame, query: str) -> Dict[str, Any]:
    q = query.lower()
    if "total" in q and "quantity" in q:
        total = float(df["GrossQuantity"].sum())
        return {"text": f"Total GrossQuantity: {total:,.2f}"}
    if "highest" in q and ("flow" in q or "flowrate" in q):
        idx = df["FlowRate"].idxmax()
        row = df.loc[idx]
        return {
            "text": f"Highest FlowRate {row['FlowRate']:.2f} at Bay {row['BayCode']} for Shipment {row['ShipmentCode']}.",
        }
    if "count" in q and ("shipments" in q or "shipment" in q):
        cnt = int(df["ShipmentID"].nunique())
        return {"text": f"Unique shipments: {cnt}"}
    return {"text": "I could not answer with built-in rules. Trying AI analysis..."}


def ai_dataframe_answer(df: pd.DataFrame, query: str) -> Dict[str, Any]:
    # Fallback minimal AI using OpenAI if key present; otherwise simple rules
    if not OPENAI_API_KEY:
        return answer_with_rules(df, query)

    try:
        from langchain_openai import ChatOpenAI
        from langchain.agents import create_pandas_dataframe_agent
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, api_key=OPENAI_API_KEY)
        agent = create_pandas_dataframe_agent(llm, df, verbose=False)
        result = agent.invoke({"input": query})
        if isinstance(result, dict) and "output" in result:
            return {"text": str(result["output"])[:4000]}
        return {"text": str(result)[:4000]}
    except Exception as e:
        return {"text": f"AI analysis failed: {e}. Falling back to rules.", **answer_with_rules(df, query)}


def trend_chart(df: pd.DataFrame, value_col: str = "GrossQuantity", date_col: str = "ExitTime") -> Dict[str, Any]:
    agg = (
        df[[date_col, value_col]]
        .dropna()
        .set_index(date_col)
        .sort_index()
        .resample("D")
        .sum()
    )
    if agg.empty:
        return {"text": "No data to plot"}
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(agg.index, agg[value_col], marker="o", linewidth=2)
    ax.set_title(f"Daily {value_col} trend")
    ax.set_xlabel("Date")
    ax.set_ylabel(value_col)
    url = save_plot_return_url(fig, f"trend_{value_col}")
    return {"text": f"Trend of {value_col} over time.", "imageUrl": url}


def forecast_gross_quantity(df: pd.DataFrame, periods: int = 14) -> Dict[str, Any]:
    series = (
        df[["ExitTime", "GrossQuantity"]]
        .dropna()
        .set_index("ExitTime")
        .sort_index()
        .resample("D")
        .sum()
        .reset_index()
    )
    if series.empty:
        return {"text": "No data available for forecasting"}

    fc_df = series.rename(columns={"ExitTime": "ds", "GrossQuantity": "y"})
    try:
        from prophet import Prophet
        model = Prophet()
        model.fit(fc_df)
        future = model.make_future_dataframe(periods=periods)
        forecast = model.predict(future)

        fig = model.plot(forecast)
        url = save_plot_return_url(fig, "forecast_gross_quantity")

        # Simple textual summary
        last_hist = forecast[forecast["ds"] <= fc_df["ds"].max()]["yhat"].tail(7).mean()
        next_fc = forecast[forecast["ds"] > fc_df["ds"].max()]["yhat"].head(7).mean()
        trend = "increase" if next_fc > last_hist else "decrease"
        pct = ((next_fc - last_hist) / max(abs(last_hist), 1e-6)) * 100
        summary = f"Forecast suggests a {trend} of approximately {pct:.1f}% over the next period."
        return {"text": summary, "imageUrl": url}
    except Exception as e:
        return {"text": f"Forecasting failed: {e}"}


# -----------------------------
# API Schemas
# -----------------------------
class AskRequest(BaseModel):
    question: str
    periods: Optional[int] = 14


class AskResponse(BaseModel):
    text: str
    imageUrl: Optional[str] = None


# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "AI Shipment Analysis API running", "health": "/health"}


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)) -> Dict[str, Any]:
    global DATAFRAME
    try:
        content = await file.read()
        df = parse_csv_to_dataframe(content)
        DATAFRAME = df
        return {"message": "CSV loaded", "rows": int(len(df)), "columns": list(df.columns)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    if DATAFRAME is None:
        raise HTTPException(status_code=400, detail="No dataset loaded. Upload a CSV first.")

    intent = classify_query_intent(req.question)
    if intent == "forecast":
        result = forecast_gross_quantity(DATAFRAME, periods=req.periods or 14)
        return AskResponse(text=result.get("text", ""), imageUrl=result.get("imageUrl"))
    elif intent == "trend":
        result = trend_chart(DATAFRAME)
        return AskResponse(text=result.get("text", ""), imageUrl=result.get("imageUrl"))
    else:
        result = answer_with_rules(DATAFRAME, req.question)
        if result.get("text", "").startswith("I could not answer"):
            result = ai_dataframe_answer(DATAFRAME, req.question)
        return AskResponse(text=result.get("text", ""), imageUrl=result.get("imageUrl"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("API_PORT", 8000)))


