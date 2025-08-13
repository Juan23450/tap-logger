import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Trash2, Clock, Pencil, Check, X, Keyboard, Coffee, Apple, Activity, StretchHorizontal, LogIn, LogOut, RefreshCw } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type ColKey = 'eat' | 'drink' | 'feel' | 'posture'
interface LogRow {
  id: string
  ts: number
  user_id?: string
  eat?: string | null
  drink?: string | null
  feel?: string | null
  posture?: string | null
  note?: string | null
}

const defaultCols: { key: ColKey; label: string; icon: React.ReactNode }[] = [
  { key: 'eat', label: 'eat', icon: <Apple className="w-4 h-4" /> },
  { key: 'drink', label: 'drink', icon: <Coffee className="w-4 h-4" /> },
  { key: 'feel', label: 'feel', icon: <Activity className="w-4 h-4" /> },
  { key: 'posture', label: 'posture', icon: <StretchHorizontal className="w-4 h-4" /> },
]

const pad = (n: number) => (n < 10 ? '0' : '') + n
const fmtTime = (ts: number) => {
  const d = new Date(ts)
  let h = d.getHours()
  const m = pad(d.getMinutes())
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function toCSV(rows: LogRow[]) {
  const headers = ['time', 'date', 'eat', 'drink', 'feel', 'posture', 'note']
  const lines = rows.map((r) => [fmtTime(r.ts), fmtDate(r.ts), r.eat || '', r.drink || '', r.feel || '', r.posture || '', (r.note || '').replaceAll('\n', ' ')])
  return [headers, ...lines]
    .map((arr) => arr.map((f) => `"${String(f).replaceAll('"', '""')}"`).join(','))
    .join('\n')
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [rows, setRows] = useState<LogRow[]>([])
  const [email, setEmail] = useState('')
  const [askNote, setAskNote] = useState(false)
  const [quickNote, setQuickNote] = useState('')
  const [pendingCol, setPendingCol] = useState<ColKey | 'note' | null>(null)
  const [syncing, setSyncing] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    ;(async () => {
      if (!session) {
        setRows([])
        return
      }
      const { data, error } = await supabase.from('logs').select('*').order('ts', { ascending: false })
      if (!error && data) setRows(data as any)
    })()
  }, [session])

  useEffect(() => {
    try {
      localStorage.setItem('taplogger.cache', JSON.stringify(rows))
    } catch {}
  }, [rows])

  useEffect(() => {
    if (!rows.length) {
      try {
        const raw = localStorage.getItem('taplogger.cache')
        if (raw) setRows(JSON.parse(raw))
      } catch {}
    }
  }, [])

  const sorted = useMemo(() => [...rows].sort((a, b) => b.ts - a.ts), [rows])

  // CLOUD-FIRST: immediately insert a row on tap
  const addRow = async (col: ColKey) => {
    if (!session) return alert('Please sign in first (email magic link).')
    const ts = Date.now()
    const r: LogRow = { id: crypto.randomUUID(), ts, user_id: session.user.id, eat: null, drink: null, feel: null, posture: null }
    r[col] = '✔'
    setRows((prev) => [r, ...prev])
    setPendingCol(col)
    setAskNote(true)
    setQuickNote('')
    try {
      const { error } = await supabase.from('logs').insert(r as any)
      if (error) throw error
    } catch (e) {
      alert('Cloud save failed. Tap “sync” later when online.')
    }
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth' }), 40)
  }

  const addNoteToLast = async (text: string) => {
    if (!session) return
    const latest = sorted[0]
    if (!latest) return
    const updated: LogRow = { ...latest }
    if (pendingCol && pendingCol !== 'note') updated[pendingCol] = text || '✔'
    if (pendingCol === 'note') updated.note = text
    setRows((prev) => [updated, ...prev.slice(1)])
    const { error } = await supabase.from('logs').upsert(updated as any, { onConflict: 'id' })
    if (error) alert('Sync failed; try again.')
  }

  const confirmNote = () => {
    addNoteToLast(quickNote.trim())
    setAskNote(false)
    setPendingCol(null)
    setQuickNote('')
  }
  const cancelNote = () => {
    // Row was already inserted to cloud with a checkmark; just close the note prompt.
    setAskNote(false)
    setPendingCol(null)
    setQuickNote('')
  }
  const addFreeNote = () => {
    if (!session) return alert('Sign in first.')
    setPendingCol('note')
    setAskNote(true)
    setQuickNote('')
    const ts = Date.now()
    const r: LogRow = { id: crypto.randomUUID(), ts, user_id: session.user.id }
    setRows((prev) => [r, ...prev])
  }

  const removeRow = async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (session) await supabase.from('logs').delete().eq('id', id)
  }

  const exportFile = async () => {
    setSyncing(true)
    let data = sorted
    if (session) {
      const res = await supabase.from('logs').select('*').order('ts', { ascending: false })
      if (!res.error && res.data) data = res.data as any
    }
    const csv = toCSV(data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taplog-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setSyncing(false)
  }

  const signIn = async () => {
    if (!email) return
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) alert(error.message)
    else alert('Check your email for the magic link.')
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'e') addRow('eat')
      if (k === 'd') addRow('drink')
      if (k === 'f') addRow('feel')
      if (k === 'p') addRow('posture')
      if (k === 'n') addFreeNote()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session])

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <h1 className="text-xl font-semibold">Tap Logger</h1>
            <span className="text-sm text-neutral-500">newest at top • cloud sync</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportFile} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 flex items-center gap-2">
              <Download className="w-4 h-4" />
              {syncing ? 'Exporting…' : 'Export CSV'}
            </button>
            {session ? (
              <button onClick={signOut} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100 flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email for magic link" className="px-2 py-1 rounded-lg border border-neutral-300 text-sm" />
                <button onClick={signIn} className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100 flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Sign in
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {defaultCols.map((c) => (
            <button key={c.key} onClick={() => addRow(c.key)} disabled={!session} className="rounded-2xl shadow-sm bg-white border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition p-3 flex flex-col items-center gap-1 disabled:opacity-50">
              <div className="text-neutral-700">{c.icon}</div>
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-[11px] text-neutral-500">press {c.key[0]}</div>
            </button>
          ))}
          <button onClick={addFreeNote} disabled={!session} className="rounded-2xl shadow-sm bg-white border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition p-3 flex flex-col items-center gap-1 disabled:opacity-50">
            <Keyboard className="w-4 h-4 text-neutral-700" />
            <div className="text-sm font-medium">note</div>
            <div className="text-[11px] text-neutral-500">press n</div>
          </button>
          <button
            onClick={() => {
              setSyncing(true)
              supabase
                .from('logs')
                .select('*')
                .order('ts', { ascending: false })
                .then(({ data }) => {
                  if (data) setRows(data as any)
                  setSyncing(false)
                })
            }}
            disabled={!session}
            className="rounded-2xl shadow-sm bg-white border border-neutral-200 hover:shadow-md hover:border-neutral-300 transition p-3 flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-neutral-700" />
            <div className="text-sm font-medium">sync</div>
            <div className="text-[11px] text-neutral-500">pull latest</div>
          </button>
        </div>

        {askNote && (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-3 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-neutral-700" />
            <input autoFocus value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="optional note (enter to save)" className="flex-1 outline-none bg-transparent" />
            <button onClick={confirmNote} className="px-2 py-1 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={cancelNote} className="px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div ref={topRef} />
        <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white">
          <div className="grid grid-cols-6 text-xs font-semibold bg-neutral-50 border-b border-neutral-200">
            <div className="px-3 py-2">time</div>
            <div className="px-3 py-2">eat</div>
            <div className="px-3 py-2">drink</div>
            <div className="px-3 py-2">feel</div>
            <div className="px-3 py-2">posture</div>
            <div className="px-3 py-2">note</div>
          </div>
          <div>
            {!session && <div className="p-6 text-sm text-neutral-600">Sign in with your email (magic link) to start logging. Your entries sync to the cloud (Supabase) and are available on any device.</div>}
            {sorted.length === 0 && session && <div className="p-6 text-sm text-neutral-500">No entries yet. Tap a button above (or press E/D/F/P/N) to create a row with the current time.</div>}
            {sorted.map((r, idx) => {
              const prev = sorted[idx - 1]
              const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(r.ts).toDateString()
              return (
                <React.Fragment key={r.id}>
                  {newDay && <div className="px-3 py-1 text-[11px] text-neutral-500 bg-neutral-50 border-t border-neutral-200">{fmtDate(r.ts)}</div>}
                  <div className="grid grid-cols-6 items-start text-sm border-b border-neutral-100 hover:bg-neutral-50">
                    <div className="px-3 py-2 whitespace-nowrap text-neutral-700">{fmtTime(r.ts)}</div>
                    <div className="px-3 py-2">{r.eat || ''}</div>
                    <div className="px-3 py-2">{r.drink || ''}</div>
                    <div className="px-3 py-2">{r.feel || ''}</div>
                    <div className="px-3 py-2">{r.posture || ''}</div>
                    <div className="px-3 py-2 flex items-center gap-2">
                      <span className="flex-1 break-words">{r.note || ''}</span>
                      <button title="delete row" onClick={() => removeRow(r.id)} className="text-neutral-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>

        <div className="mt-4 text-xs text-neutral-500">Tips: Use keyboard shortcuts <span className="font-mono">E/D/F/P/N</span>. Newest rows always appear at the top. Cloud saves happen immediately; use “sync” to pull latest if you used another device.</div>
      </div>
    </div>
  )
}
