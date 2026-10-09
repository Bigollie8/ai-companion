import React from 'react'
import type { DashboardData, SessionSummary, UsageLimit, UsageLimits } from '../lib/types'
import type { LiveMetrics } from '../hooks/useLiveMetrics'
import { Dial } from './Dial'
import { NeedsYou } from './NeedsYou'
import { formatCost, formatDuration, formatTokenCount } from '../lib/formatters'
import { describeClaudeStatus, windowLabel } from '../lib/limits'

type Provider = 'all' | 'claude' | 'codex'
interface Props {
  provider: Provider
  data: DashboardData
  metrics: LiveMetrics
  waiting: SessionSummary[]
  onDismiss: () => void
  livePolling: { enabled: boolean; toggle: () => void }
  onOpenWidget: () => void
}

function resetDetail(limit: UsageLimit, now: number): string {
  const window = windowLabel(limit.windowMinutes)
  if (limit.resetsAt && limit.resetsAt <= now) return `${window} · reset passed`
  if (!limit.resetsAt) return `${window} · reset time unavailable`
  const at = new Date(limit.resetsAt)
  const sameDay = at.toDateString() === new Date(now).toDateString()
  return `${window} · resets ${sameDay ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}
const windows = (limits: UsageLimits | null): UsageLimit[] => [limits?.primary, limits?.secondary].filter((w): w is UsageLimit => w != null)

export function NowPane({ provider, data, metrics, waiting, onDismiss, livePolling, onOpenWidget }: Props) {
  const now = Date.now()
  const claude = windows(data.claudeLimits)
  const codex = windows(data.codexLimits)
  const claudeTag = data.claudeLimits?.source === 'live' ? 'live' : data.claudeLimits?.source === 'transcript' ? 'from a transcript notice' : undefined
  const claudeEmptyDetail = describeClaudeStatus(data.claudeLimitsStatus, data.claudeLimits)
  let delay = 0
  const next = () => { const d = delay; delay += 150; return d }
  return <aside className="now">
    <div className="now-label"><span>NOW</span><em>{new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}</em></div>

    <div className="dials">
      {provider !== 'codex' && (claude.length
        ? claude.map((limit, i) => <Dial key={`claude-${i}`} percent={limit.usedPercent} color="var(--claude)" label={`Claude · ${windowLabel(limit.windowMinutes).replace(' window', '')}`} detail={resetDetail(limit, now).replace(`${windowLabel(limit.windowMinutes)} · `, '')} tag={i === 0 ? claudeTag : undefined} delay={next()} warn={limit.usedPercent >= 80 && (!limit.resetsAt || limit.resetsAt > now)} />)
        : <Dial percent={null} color="var(--claude)" label="Claude" detail={claudeEmptyDetail} delay={next()} />)}
      {provider !== 'claude' && (codex.length
        ? codex.map((limit, i) => <Dial key={`codex-${i}`} percent={limit.usedPercent} color="var(--codex)" label={`Codex · ${windowLabel(limit.windowMinutes).replace(' window', '')}`} detail={resetDetail(limit, now).replace(`${windowLabel(limit.windowMinutes)} · `, '')} tag={i === 0 ? 'last reported' : undefined} delay={next()} warn={limit.usedPercent >= 80 && (!limit.resetsAt || limit.resetsAt > now)} />)
        : <Dial percent={null} color="var(--codex)" label="Codex" detail="No allowance snapshot yet" delay={next()} />)}
      {provider !== 'codex' && <button className="live-toggle" aria-pressed={livePolling.enabled} title="The only network call this app makes: your Claude allowance, read with your Claude Code sign-in every 5 minutes" onClick={livePolling.toggle}>Claude live check {livePolling.enabled ? 'on' : 'off'}</button>}
    </div>

    <div className="now-today rise" style={{ animationDelay: '300ms' }}>
      <strong className="now-hero">{formatTokenCount(metrics.todayTotalTokens)}</strong>
      <span className="now-sub">tokens today · <span title="Standard API estimate, not your subscription bill">{formatCost(metrics.todayCost)} API est.</span></span>
      <div className="now-counts">
        <span><b>{metrics.todaySessionCount}</b> sessions</span>
        <span><b>{formatDuration(metrics.todayActiveTimeMs)}</b> active</span>
        <span title="Estimated savings from cached input at known rates"><b>{formatCost(metrics.todayCacheSavings)}</b> cached</span>
      </div>
    </div>

    <div className="rise" style={{ animationDelay: '400ms' }}><NeedsYou waiting={waiting} onDismiss={onDismiss} /></div>

    <div className="now-footer">
      <span className={`live-dot ${metrics.isActive ? 'on' : ''}`} aria-hidden="true" />
      <span>{metrics.isActive ? 'Activity in the last 2 min' : 'No recent activity'}</span>
      <button className="link-button" onClick={onOpenWidget}>Open widget</button>
    </div>
  </aside>
}
