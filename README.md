## Honeywell AI Shipment Dashboard (Local)

This project provides a local React + FastAPI web app with an AI-powered chatbot for shipment CSV analysis, trend charting, and forecasting using Prophet.

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend Setup (FastAPI + Python)
1. Install dependencies globally or in your preferred environment (no venv required):
```bash
cd "/Users/apple/Documents/Jonath/Hackathons/Honeywell /AI Dashboard/backend"
python3 -m pip install --upgrade pip
pip install -r requirements.txt
```

2. Configure environment variables (optional but recommended):
Create a `.env` file in `backend/` with:
```bash
OPENAI_API_KEY=your_openai_key_here
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
```

3. Run the API server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup (React + Vite)
1. Install dependencies and run dev server:
```bash
cd "/Users/apple/Documents/Jonath/Hackathons/Honeywell /AI Dashboard/frontend"
npm install
npm run dev -- --host
```

2. Configure frontend to talk to backend (optional):
Create `frontend/.env` with:
```bash
VITE_API_BASE=http://localhost:8000
```

### Usage
- Open the frontend dev URL shown by Vite (usually http://localhost:5173)
- Upload a shipment CSV with columns at minimum:
  - GrossQuantity, FlowRate, ShipmentCompartmentID, BaseProductID, BaseProductCode,
    ShipmentID, ShipmentCode, ExitTime, BayCode, ScheduledDate, CreatedTime
- Ask questions in natural language. Examples:
  - "total quantity shipped"
  - "highest flow rate bay"
  - "show me the trend of GrossQuantity over the last month"
  - "forecast GrossQuantity for next 2 weeks"

### Notes
- If `OPENAI_API_KEY` is not set, the backend falls back to built-in rule-based analysis for common queries. Forecasting and charting do not require OpenAI.
- Charts are generated and saved under `backend/app/static/charts` and served from `/static/charts/...`.

### Offline AI (no internet)
You can enable local AI without OpenAI by running Ollama and a local model:
1. Install Ollama: see `https://ollama.com`
2. Pull a model (example):
```bash
ollama pull llama3.1:8b
```
3. Start the backend normally. If `OPENAI_API_KEY` is not set, the backend will attempt to use Ollama via LangChain. If Ollama is not available, it falls back to built-in rule answers and chart/forecast endpoints still work.



