import { useEffect, useRef, useState } from 'react'
import type { CodexLimits } from '../lib/types'

export function useMiniAlerts(limits: CodexLimits | null) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('mini-alerts') !== 'off' } catch { return true } })
  const [pulse, setPulse] = useState(false)
  const [now, setNow] = useState(Date.now())
  const previous = useRef<Record<string, number> | null>(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [])
  const windows = [limits?.primary, limits?.secondary].filter(w => w && Number.isFinite(w.usedPercent))
  const currentTime = Math.max(now, Date.now())
  const current = windows.filter(w => !w!.resetsAt || w!.resetsAt > currentTime)
  const limit = [...(current.length ? current : windows)].sort((a, b) => b!.usedPercent - a!.usedPercent)[0] ?? null
  const expired = !!limit?.resetsAt && limit.resetsAt <= currentTime
  const warning = !expired && limit && limit.usedPercent >= 80 ? (limit.usedPercent >= 95 ? 'Almost at your Codex limit' : 'Codex allowance running low') : null
  useEffect(() => {
    if (!limits) return
    const next: Record<string, number> = {}
    let crossed = false
    for (const [index, window] of [limits.primary, limits.secondary].entries()) {
      if (!window || !Number.isFinite(window.usedPercent) || (window.resetsAt && window.resetsAt <= Date.now())) continue
      const key = `${index}:${window.windowMinutes}:${window.resetsAt ?? 'unknown'}`
      const tier = window.usedPercent >= 95 ? 2 : window.usedPercent >= 80 ? 1 : 0
      next[key] = tier
      if (previous.current && tier > (previous.current[key] ?? tier)) crossed = true
    }
    previous.current = next
    // An old snapshot or opening the widget is not a new notification.
    if (enabled && crossed && limits.observedAt >= Date.now() - 5 * 60000) setPulse(true)
  }, [limits, enabled])
  useEffect(() => { if (!pulse) return; const timer = setTimeout(() => setPulse(false), 5400); return () => clearTimeout(timer) }, [pulse])
  const toggle = () => { setEnabled(value => { try { localStorage.setItem('mini-alerts', value ? 'off' : 'on') } catch {} return !value }); setPulse(false) }
  return { enabled, toggle, pulse, warning, limit, expired }
}
