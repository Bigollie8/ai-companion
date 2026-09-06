import React from 'react'
import type { CodexLimits } from '../lib/types'
import { formatRelativeTime } from '../lib/formatters'
export function CodexUsage({ limits }: { limits: CodexLimits | null }) {
  const windows = [limits?.primary, limits?.secondary].filter(w => w != null)
  return <div className="usage-limits"><div className="section-heading"><h2>Codex allowance</h2><span className="small-badge">LAST REPORTED</span></div>
    {!limits || !windows.length ? <p className="muted">No allowance snapshot found yet. Token statistics still appear when recorded.</p> : <>
      {windows.map((window, i) => {
        const minutes = window!.windowMinutes
        const label = minutes >= 1440 ? `${minutes / 1440}-day window` : minutes >= 60 ? `${minutes / 60}-hour window` : `${minutes}-minute window`
        const expired = !!window!.resetsAt && window!.resetsAt <= Date.now()
        return <div className="limit-window" key={i}><div className="limit-heading"><span>{label}</span><b>{window!.usedPercent}% <small>used</small></b></div><div className="limit-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={window!.usedPercent}><div style={{ width: `${window!.usedPercent}%`, background: window!.usedPercent >= 85 ? '#fbbf77' : undefined }} /></div><p>{expired ? 'Reset time passed · waiting for a new snapshot' : window!.resetsAt ? `Resets ${new Date(window!.resetsAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Reset time unavailable'}</p></div>
      })}
      <p className="snapshot-time" title={new Date(limits.observedAt).toLocaleString()}>Observed {formatRelativeTime(limits.observedAt)} · updates with Codex activity</p>
    </>}
  </div>
}
