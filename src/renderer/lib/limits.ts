import type { ClaudeLimitsStatus, UsageLimit, UsageLimits } from '../../shared/types'

export type Provider = 'claude' | 'codex'
export const providerName: Record<Provider, string> = { claude: 'Claude', codex: 'Codex' }

const windows = (limits: UsageLimits | null): UsageLimit[] =>
  [limits?.primary, limits?.secondary].filter((w): w is UsageLimit => w != null && Number.isFinite(w.usedPercent))
const live = (window: UsageLimit, now: number) => !window.resetsAt || window.resetsAt > now

/** The window worth showing: the busiest one that has not reset, else the busiest stale one. */
export function activeLimit(limits: UsageLimits | null, now: number): { limit: UsageLimit | null; expired: boolean } {
  const all = windows(limits)
  const current = all.filter(w => live(w, now))
  const limit = [...(current.length ? current : all)].sort((a, b) => b.usedPercent - a.usedPercent)[0] ?? null
  return { limit, expired: !!limit && !current.length }
}

export function limitWarning(provider: Provider, limit: UsageLimit | null, expired: boolean): string | null {
  if (!limit || expired || limit.usedPercent < 80) return null
  return limit.usedPercent >= 95 ? `Almost at your ${providerName[provider]} limit` : `${providerName[provider]} allowance running low`
}

/** Alert tier (0, 1 at 80%, 2 at 95%) for each window that has not reset, keyed so a new reset period starts fresh. */
export function limitTiers(limits: UsageLimits | null, now: number): Record<string, number> {
  const tiers: Record<string, number> = {}
  for (const [index, window] of [limits?.primary, limits?.secondary].entries()) {
    if (!window || !Number.isFinite(window.usedPercent) || !live(window, now)) continue
    tiers[`${index}:${window.windowMinutes}:${window.resetsAt ?? 'unknown'}`] = window.usedPercent >= 95 ? 2 : window.usedPercent >= 80 ? 1 : 0
  }
  return tiers
}

export function crossedTier(previous: Record<string, number> | null, next: Record<string, number>): boolean {
  if (!previous) return false
  return Object.entries(next).some(([key, tier]) => tier > (previous[key] ?? tier))
}

export function windowLabel(minutes: number, short = false): string {
  const [value, unit] = minutes >= 1440 ? [minutes / 1440, 'day'] : minutes >= 60 ? [minutes / 60, 'hour'] : [minutes, 'minute']
  return short ? `${value}${unit[0]}` : `${value}-${unit} window`
}

export function describeClaudeStatus(status: ClaudeLimitsStatus | undefined, limits: UsageLimits | null): string {
  if (limits?.source === 'transcript') return 'From a limit notice in a local transcript'
  switch (status) {
    case 'ok': return limits ? 'Live from your Claude account' : 'Checking your Claude account…'
    case 'off': return 'Live check is off'
    case 'no-credentials': return 'Sign in to Claude Code to enable the live check'
    case 'expired': return 'Claude Code sign-in expired · open Claude Code to renew it'
    case 'error': return 'Live check failed · retrying every 5 minutes'
    default: return 'Checking your Claude account…'
  }
}
