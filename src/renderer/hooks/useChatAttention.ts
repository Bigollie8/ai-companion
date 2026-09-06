import { useEffect, useRef, useState } from 'react'
import type { DashboardData } from '../lib/types'

export function useChatAttention(data: DashboardData, enabled: boolean) {
  const [now, setNow] = useState(Date.now())
  const [pulse, setPulse] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const seen = useRef<Map<string, { firstSeen: number; notified: boolean; eligible: boolean }> | null>(null)
  const key = (session: DashboardData['sessions'][number]) => `${session.sessionId}:${session.attention?.requestId}`
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const currentTime = Math.max(now, Date.now())
  const candidates = data.sessions.filter(s => s.attention && s.dataQuality !== 'history-only' && s.attention.requestedAt <= currentTime && currentTime - s.attention.requestedAt < 10 * 60000)
  useEffect(() => {
    if (!data.lastUpdated) return
    const baseline = seen.current === null
    seen.current ??= new Map()
    let notify = false
    for (const session of candidates) {
      const id = key(session)
      let entry = seen.current.get(id)
      if (!entry) {
        entry = { firstSeen: currentTime, notified: baseline, eligible: !baseline && currentTime - session.attention!.requestedAt < 2 * 60000 }
        seen.current.set(id, entry)
      }
      // Wait for another observation before treating a briefly pending call as blocked.
      if (entry.eligible && !entry.notified && currentTime - entry.firstSeen >= 3000) {
        entry.notified = true
        if (enabled) notify = true
      }
    }
    if (notify) setPulse(true)
  }, [data, now, enabled])
  useEffect(() => { if (!pulse) return; const timer = setTimeout(() => setPulse(false), 5400); return () => clearTimeout(timer) }, [pulse])
  const waiting = candidates.filter(s => {
    const entry = seen.current?.get(key(s))
    return entry?.eligible && currentTime - entry.firstSeen >= 3000 && !dismissed.has(key(s))
  })
  const dismiss = () => { setDismissed(previous => new Set([...previous, ...waiting.map(key)])); setPulse(false) }
  return { waiting, pulse: enabled && waiting.length > 0 && pulse, dismiss }
}
