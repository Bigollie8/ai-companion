import { useEffect, useRef, useState } from 'react'
import type { UsageLimit, UsageLimits } from '../lib/types'
import { savePreferences } from '../lib/desktop'
import { activeLimit, crossedTier, limitTiers, limitWarning, type Provider } from '../lib/limits'

export type ProviderLimits = Record<Provider, UsageLimits | null>
export interface AllowanceRow { provider: Provider; limit: UsageLimit | null; expired: boolean; observedAt: number | null }
const providers: Provider[] = ['claude', 'codex']

export function useMiniAlerts(limits: ProviderLimits) {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('mini-alerts') !== 'off' } catch { return true } })
  const [pulse, setPulse] = useState(false)
  const [now, setNow] = useState(Date.now())
  const previous = useRef<Record<Provider, Record<string, number> | null>>({ claude: null, codex: null })
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [])
  const currentTime = Math.max(now, Date.now())
  const rows: AllowanceRow[] = providers.map(provider => ({ provider, ...activeLimit(limits[provider], currentTime), observedAt: limits[provider]?.observedAt ?? null }))
  // Surface the provider closest to its limit.
  const warning = rows
    .map(row => ({ text: limitWarning(row.provider, row.limit, row.expired), used: row.limit?.usedPercent ?? 0 }))
    .filter(w => w.text).sort((a, b) => b.used - a.used)[0]?.text ?? null
  useEffect(() => {
    let crossed = false
    for (const provider of providers) {
      const snapshot = limits[provider]
      if (!snapshot) continue
      const next = limitTiers(snapshot, Date.now())
      // An old snapshot or opening the widget is not a new notification.
      if (crossedTier(previous.current[provider], next) && snapshot.observedAt >= Date.now() - 5 * 60000) crossed = true
      previous.current[provider] = next
    }
    if (enabled && crossed) setPulse(true)
  }, [limits.claude, limits.codex, enabled])
  useEffect(() => { if (!pulse) return; const timer = setTimeout(() => setPulse(false), 5400); return () => clearTimeout(timer) }, [pulse])
  const toggle = () => { setEnabled(value => { try { localStorage.setItem('mini-alerts', value ? 'off' : 'on'); savePreferences() } catch {} return !value }); setPulse(false) }
  return { enabled, toggle, pulse, warning, rows }
}

/** The Claude live allowance check; the Rust poller reads the same preference. */
export function useLivePolling() {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('claude-limits') !== 'off' } catch { return true } })
  const toggle = () => setEnabled(value => { try { localStorage.setItem('claude-limits', value ? 'off' : 'on'); savePreferences() } catch {} return !value })
  return { enabled, toggle }
}
