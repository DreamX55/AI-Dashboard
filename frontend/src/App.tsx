import React, { useMemo, useRef, useState } from 'react'
import axios from 'axios'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
}

const API_BASE = import.meta.env.VITE_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000`

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const canAsk = useMemo(() => !loading && input.trim().length > 0, [input, loading])

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
      const msg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `CSV loaded: ${res.data.rows} rows. Columns: ${res.data.columns.join(', ')}`
      }
      setMessages(m => [...m, msg])
    } catch (err: any) {
      const text = err?.response?.data?.detail || err.message || 'Upload failed'
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text }])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleAsk() {
    if (!canAsk) return
    const q: Message = { id: crypto.randomUUID(), role: 'user', text: input }
    setMessages(m => [...m, q])
    setInput('')
    setLoading(true)
    try {
      const res = await axios.post(`${API_BASE}/ask`, { question: q.text })
      const { text, imageUrl } = res.data
      const a: Message = { id: crypto.randomUUID(), role: 'assistant', text, imageUrl }
      setMessages(m => [...m, a])
    } catch (err: any) {
      const text = err?.response?.data?.detail || err.message || 'Request failed'
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'assistant', text }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, Arial' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>AI Shipment Dashboard</h2>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} disabled={uploading} />
          {uploading && <span>Uploading...</span>}
        </label>
      </header>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, minHeight: 400 }}>
        {messages.length === 0 && (
          <div style={{ color: '#888' }}>Upload a CSV and ask a question to begin.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map(m => (
            <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{
                background: m.role === 'user' ? '#006eff' : '#f3f4f6',
                color: m.role === 'user' ? 'white' : '#111827',
                padding: '10px 12px', borderRadius: 8
              }}>
                {m.text}
              </div>
              {m.imageUrl && (
                <img src={`${API_BASE}${m.imageUrl}`} alt="chart" style={{ marginTop: 8, borderRadius: 8, border: '1px solid #eee', maxWidth: '100%' }} />
              )}
            </div>
          ))}
        </div>
      </section>

      <footer style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAsk() }}
          placeholder="Ask about quantities, flow rate, trends, forecasts..."
          style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button onClick={handleAsk} disabled={!canAsk} style={{ padding: '12px 16px', borderRadius: 8, background: '#006eff', color: 'white', border: 0 }}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </footer>
    </div>
  )
}


