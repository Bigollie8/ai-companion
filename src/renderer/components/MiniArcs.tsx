import React from 'react'
import type { ClaudeLimitsStatus } from '../lib/types'
import type { AllowanceRow } from '../hooks/useMiniAlerts'
import { ringArc, RING_RADIUS, RING_CENTRE } from '../lib/dial'
import { providerName, windowLabel } from '../lib/limits'

interface Props {
  rows: AllowanceRow[]
  claudeStatus?: ClaudeLimitsStatus
}

const shortStatus: Record<string, string> = { off: 'live check off', 'no-credentials': 'sign in to Claude Code', expired: 'sign-in expired', error: 'check failed', pending: 'checking…', ok: 'checking…' }
const resetLabel = (at: number | null) => at ? new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null

/** The two allowance arcs drawn just inside the widget ring, with a label block under each. */
export function MiniArcs({ rows, claudeStatus }: Props) {
  return <>
    <svg aria-hidden="true" className="orb-arcs" width="340" height="340" viewBox="0 0 340 340">
      {rows.map(({ provider, limit, expired }, i) => {
        const side = provider === 'claude' ? 'left' : 'right'
        const geometry = ringArc(limit?.usedPercent ?? 0, side)
        const warn = !!limit && !expired && limit.usedPercent >= 80
        return <g key={provider}>
          <circle cx={RING_CENTRE} cy={RING_CENTRE} r={RING_RADIUS} fill="none" stroke="var(--track)" strokeWidth={5} strokeLinecap="round" strokeDasharray={geometry.trackDash} transform={geometry.transform} />
          {limit && <circle key={Math.round(limit.usedPercent)} cx={RING_CENTRE} cy={RING_CENTRE} r={RING_RADIUS} fill="none" stroke={warn ? 'var(--warn)' : `var(--${provider})`} strokeWidth={5} strokeLinecap="round" strokeDasharray={geometry.fillDash} transform={geometry.transform} className="dial-fill" style={{ ['--circ' as string]: geometry.circumference.toFixed(2), animationDelay: `${100 + i * 200}ms` }} />}
        </g>
      })}
    </svg>
    {rows.map(({ provider, limit, expired }) => {
      const warn = !!limit && !expired && limit.usedPercent >= 80
      const title = limit ? `${windowLabel(limit.windowMinutes)} · ${expired ? 'reset passed, awaiting update' : limit.resetsAt ? `resets ${new Date(limit.resetsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'reset time unavailable'}` : undefined
      return <div className={`orb-arc-label ${provider} ${warn ? 'warn' : ''}`} key={provider} title={title}>
        <span>{providerName[provider].toUpperCase()}</span>
        <b>{limit ? `${Math.round(limit.usedPercent)}%` : '–'}</b>
        <small>{limit ? `${windowLabel(limit.windowMinutes, true)}${expired ? ' · reset passed' : resetLabel(limit.resetsAt) ? ` · resets ${resetLabel(limit.resetsAt)}` : ''}` : provider === 'claude' ? shortStatus[claudeStatus ?? 'pending'] : 'no snapshot'}</small>
      </div>
    })}
  </>
}
