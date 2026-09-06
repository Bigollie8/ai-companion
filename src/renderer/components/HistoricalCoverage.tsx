import React from 'react'
import type { DashboardSnapshot } from '../lib/types'
import { formatTokenCount, totalTokens, formatModelName } from '../lib/formatters'

export function HistoricalCoverage({ data, compact = false, onBrowse }: { data: DashboardSnapshot; compact?: boolean; onBrowse?: () => void }) {
  const sessions = data.sessions.filter(s => s.provider === 'claude')
  const archive = data.claudeArchive
  if (!sessions.length && !archive) return null
  const first = Math.min(...sessions.map(s => s.startedAt), archive?.firstSessionAt ?? Infinity)
  const last = Math.max(...sessions.map(s => s.lastMessageAt), archive ? Date.parse(archive.throughDate + 'T00:00:00') : 0)
  const recovered = sessions.filter(s => s.dataQuality === 'history-only').length
  const months = new Map<string, { full: number; historical: number }>()
  for (const s of sessions) {
    const d = new Date(s.startedAt), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = months.get(key) || { full: 0, historical: 0 }
    if (s.dataQuality === 'history-only') bucket.historical++; else bucket.full++
    months.set(key, bucket)
  }
  const date = (ts: number) => new Date(ts).toLocaleDateString([], { month: 'short', year: 'numeric' })
  const exportArchive = () => {
    if (!archive) return
    const rows = [
      ['Source', 'From', 'Through', 'Sessions', 'Messages', 'Input tokens', 'Output tokens', 'Cache read tokens', 'Cache write tokens'],
      ['Claude saved stats cache (separate snapshot)', new Date(archive.firstSessionAt).toISOString(), archive.throughDate, archive.sessionCount, archive.messageCount, archive.tokenUsage.inputTokens, archive.tokenUsage.outputTokens, archive.tokenUsage.cacheReadTokens, archive.tokenUsage.cacheCreationTokens]
    ]
    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a'); link.href = url; link.download = `claude-saved-history-${archive.throughDate}.csv`; link.click(); URL.revokeObjectURL(url)
  }
  return <div className="history-coverage px-4 py-3">
    <div className="section-heading"><h2>Claude historical coverage</h2><span>{date(first)} – {date(last)}</span></div>
    <p className="text-sm text-gray-300"><strong>{sessions.length.toLocaleString()}</strong> recorded sessions · <strong>{recovered.toLocaleString()}</strong> recovered from older history</p>
    <p className="text-xs text-gray-500 mt-2">{sessions.length - recovered} sessions have detailed transcripts. Older entries preserve dates and projects; missing token and cost data is marked unavailable.</p>
    {compact ? <button className="load-more" onClick={onBrowse}>Browse full Claude history</button> : <>
      <div className="history-months">
        <div className="history-month-row history-month-header"><span>Started in</span><span>Detailed</span><span>History only</span></div>
        {[...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => <div className="history-month-row" key={month}><span>{new Date(month + '-01T00:00:00').toLocaleDateString([], { month: 'short', year: 'numeric' })}</span><span>{count.full || '—'}</span><span>{count.historical || '—'}</span></div>)}
      </div>
      {archive && <div className="archive-snapshot">
        <h3>Saved Claude usage snapshot</h3>
        <p className="text-xs text-gray-500 mt-1">{date(archive.firstSessionAt)} through {new Date(archive.throughDate + 'T00:00:00').toLocaleDateString()} · from Claude’s stats cache</p>
        <div className="archive-totals"><div><strong>{formatTokenCount(totalTokens(archive.tokenUsage))}</strong><span>Recorded tokens</span></div><div><strong>{archive.sessionCount.toLocaleString()}</strong><span>Cached sessions</span></div><div><strong>{archive.messageCount.toLocaleString()}</strong><span>Cached messages</span></div></div>
        <p className="text-xs text-gray-500">This snapshot overlaps the session catalog and has no session IDs. It is preserved separately, not added to the live totals. Missing months are not zero usage.</p>
        <details className="mt-3"><summary className="text-xs text-gray-300 cursor-pointer">Cached model and token details</summary><div className="space-y-2 mt-3">{archive.models.map(m => <div key={m.model} className="text-xs text-gray-400"><strong>{formatModelName(m.model)}</strong><div>{formatTokenCount(m.tokenUsage.inputTokens)} input · {formatTokenCount(m.tokenUsage.outputTokens)} output · {formatTokenCount(m.tokenUsage.cacheReadTokens)} cache reads · {formatTokenCount(m.tokenUsage.cacheCreationTokens)} cache writes</div></div>)}</div></details>
        <button className="load-more" onClick={exportArchive}>Export saved historical totals</button>
      </div>}
    </>}
  </div>
}
