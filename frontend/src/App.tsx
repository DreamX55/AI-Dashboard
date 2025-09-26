import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
}

const API_BASE = import.meta.env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000`

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message?: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: String(error?.message || error) }
  }
  componentDidCatch(error: any) {
    console.error('UI Error:', error)
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 24 }}>
        <h3>Something went wrong</h3>
        <div style={{ color: '#b91c1c' }}>{this.state.message}</div>
        <div style={{ marginTop: 8, color: '#6b7280' }}>Check the browser console for details.</div>
      </div>
    }
    return this.props.children as any
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light' } catch (_) { return 'light' }
  })
  const [dashboards, setDashboards] = useState<{ id: string; question?: string; text: string; imageUrl?: string; createdAt: number }[]>([])
  const [activeDashboard, setActiveDashboard] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const canAsk = useMemo(() => !loading && input.trim().length > 0, [input, loading])

  function generateId(): string {
    try {
      const c: any = (window as any).crypto
      if (c && typeof c.randomUUID === 'function') return c.randomUUID()
    } catch (_) {}
    return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now()
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('dashboards')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setDashboards(parsed)
      }
    } catch (_) {}
  }, [])

  function persistDashboards(next: typeof dashboards) {
    setDashboards(next)
    try { localStorage.setItem('dashboards', JSON.stringify(next)) } catch (_) {}
  }

  useEffect(() => {
    try { localStorage.setItem('theme', theme) } catch (_) {}
  }, [theme])

  const colors = useMemo(() => {
    if (theme === 'dark') {
      return {
        bg: '#0b0f19',
        text: '#e5e7eb',
        subtle: '#9ca3af',
        cardBg: '#111827',
        border: '#1f2937',
        primary: '#3b82f6',
        userBubbleBg: '#2563eb',
        userBubbleText: '#ffffff',
        botBubbleBg: '#111827',
        botBubbleText: '#e5e7eb',
        buttonBg: '#2563eb',
        buttonText: '#ffffff',
        dashed: '#374151'
      }
    }
    return {
      bg: '#ffffff',
      text: '#111827',
      subtle: '#6b7280',
      cardBg: '#f9fafb',
      border: '#e5e7eb',
      primary: '#006eff',
      userBubbleBg: '#006eff',
      userBubbleText: '#ffffff',
      botBubbleBg: '#f3f4f6',
      botBubbleText: '#111827',
      buttonBg: '#006eff',
      buttonText: '#ffffff',
      dashed: '#9ca3af'
    }
  }, [theme])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await axios.post(`${API_BASE}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const rows: number | undefined = res?.data?.rows
      const columns: string[] | undefined = res?.data?.columns
      const msg: Message = {
        id: generateId(),
        role: 'assistant',
        text: `CSV loaded${typeof rows === 'number' ? `: ${rows} rows` : ''}. Columns: ${Array.isArray(columns) ? columns.join(', ') : 'n/a'}`
      }
      setMessages(m => [...m, msg])
    } catch (err: any) {
      const text = err?.response?.data?.detail || err.message || 'Upload failed'
      setMessages(m => [...m, { id: generateId(), role: 'assistant', text }])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault()
    const file = ev.dataTransfer.files?.[0]
    if (file && fileRef.current) {
      const dt = new DataTransfer()
      dt.items.add(file)
      fileRef.current.files = dt.files
      const event = { target: { files: dt.files } } as unknown as React.ChangeEvent<HTMLInputElement>
      handleUpload(event)
    }
  }

  async function handleAsk() {
    if (!canAsk) return
    const q: Message = { id: generateId(), role: 'user', text: input }
    setMessages(m => [...m, q])
    setInput('')
    setLoading(true)
    try {
      const res = await axios.post(`${API_BASE}/ask`, { question: q.text })
      const { text, imageUrl } = res.data
      const a: Message = { id: generateId(), role: 'assistant', text, imageUrl }
      setMessages(m => [...m, a])

      // Save to dashboards history if it includes a chart or meaningful response
      if (imageUrl || (text && text.length > 0)) {
        const entry = { id: generateId(), question: q.text, text, imageUrl, createdAt: Date.now() }
        const next = [entry, ...dashboards].slice(0, 100)
        persistDashboards(next)
      }
    } catch (err: any) {
      const text = err?.response?.data?.detail || err.message || 'Request failed'
      setMessages(m => [...m, { id: generateId(), role: 'assistant', text }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <ErrorBoundary>
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter, system-ui, Arial', background: colors.bg, color: colors.text }}>
      {/* Sidebar */}
      <aside style={{ width: 280, borderRight: `1px solid ${colors.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Data & History</div>

        {/* Drag & Drop upload */}
        <div
          onDragOver={e => { e.preventDefault() }}
          onDrop={handleDrop}
          style={{ border: `2px dashed ${colors.dashed}`, borderRadius: 8, padding: 16, textAlign: 'center', color: colors.subtle, background: theme === 'dark' ? '#0f172a' : undefined }}
        >
          Drag & drop CSV here
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
              <span style={{ padding: '6px 10px', background: theme === 'dark' ? '#111827' : colors.text, color: theme === 'dark' ? colors.text : '#ffffff', borderRadius: 6 }}>{uploading ? 'Uploading...' : 'Browse CSV'}</span>
            </label>
          </div>
        </div>

        {/* Saved dashboards */}
        <div style={{ fontWeight: 600, marginTop: 4 }}>Saved dashboards</div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dashboards.length === 0 && <div style={{ color: colors.subtle }}>No saved charts yet.</div>}
          {dashboards.map(d => (
            <button
              key={d.id}
              onClick={() => setActiveDashboard(d.id)}
              style={{ textAlign: 'left', padding: 10, borderRadius: 8, border: `1px solid ${colors.border}`, background: activeDashboard === d.id ? (theme === 'dark' ? '#0f172a' : '#f3f4f6') : (theme === 'dark' ? '#0b0f19' : '#ffffff'), color: colors.text }}
            >
              <div style={{ fontSize: 12, color: colors.subtle }}>{new Date(d.createdAt).toLocaleString()}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginTop: 2 }}>{d.question || 'Chart'}</div>
              {d.imageUrl && <div style={{ fontSize: 12, color: colors.subtle, marginTop: 2 }}>Image</div>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>AI Shipment Dashboard</div>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.cardBg, color: colors.text }}>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </header>

        <section style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          {activeDashboard ? (
            (() => {
              const d = dashboards.find(x => x.id === activeDashboard)
              if (!d) return <div style={{ color: colors.subtle }}>Not found.</div>
              return (
                <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {d.question && <div style={{ alignSelf: 'flex-end', background: colors.userBubbleBg, color: colors.userBubbleText, padding: '10px 12px', borderRadius: 8 }}>{d.question}</div>}
                  <div style={{ background: colors.botBubbleBg, color: colors.botBubbleText, padding: '10px 12px', borderRadius: 8 }}>{d.text}</div>
                  {d.imageUrl && (
                    <img src={`${API_BASE}${d.imageUrl}`} alt="chart" style={{ borderRadius: 8, border: '1px solid #eee', maxWidth: '100%' }} />
                  )}
                </div>
              )
            })()
          ) : (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              {messages.length === 0 && (<div style={{ color: colors.subtle }}>Upload a CSV and ask a question to begin.</div>)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map(m => (
                  <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                    <div style={{ background: m.role === 'user' ? colors.userBubbleBg : colors.botBubbleBg, color: m.role === 'user' ? colors.userBubbleText : colors.botBubbleText, padding: '10px 12px', borderRadius: 8 }}>
                      {m.text}
                    </div>
                    {m.imageUrl && (
                      <img src={`${API_BASE}${m.imageUrl}`} alt="chart" style={{ marginTop: 8, borderRadius: 8, border: '1px solid #eee', maxWidth: '100%' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <footer style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border}` }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAsk() }}
            placeholder="Ask about quantities, flow rate, trends, forecasts..."
            style={{ flex: 1, padding: 12, borderRadius: 8, background: colors.cardBg, color: colors.text, border: `1px solid ${colors.border}` }}
          />
          <button onClick={handleAsk} disabled={!canAsk} style={{ padding: '12px 16px', borderRadius: 8, background: colors.buttonBg, color: colors.buttonText, border: 0 }}>
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </footer>
      </main>
    </div>
    </ErrorBoundary>
  )
}


