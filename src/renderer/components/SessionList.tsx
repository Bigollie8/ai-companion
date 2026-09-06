import React, { useState } from 'react'
import type { SessionSummary } from '../lib/types'
import {
  formatTokenCount,
  formatCost,
  formatDuration,
  formatRelativeTime,
  formatModelName,
  totalTokens
} from '../lib/formatters'
import { usePrivacy } from '../lib/privacy'

interface Props {
  sessions: SessionSummary[]
  title?: string
  maxItems?: number
  fullHeight?: boolean
}

function EntrypointBadge({ entrypoint }: { entrypoint: string }) {
  const isDesktop = entrypoint.includes('desktop')
  const isCodex = entrypoint.startsWith('codex')
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${
        isDesktop ? 'bg-purple-500/15 text-accent-purple' : 'bg-blue-500/15 text-accent-blue'
      }`}
    >
      {isCodex ? 'Codex' : isDesktop ? 'Claude Desktop' : 'Claude Code'}
    </span>
  )
}

export function SessionList({
  sessions,
  title = 'Recent Sessions',
  maxItems = 20,
  fullHeight = false
}: Props) {
  const { isHidden, showHidden, maskName } = usePrivacy()

  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('all')
  const [sort, setSort] = useState('recent')
  const [limit, setLimit] = useState(maxItems)
  const visible = showHidden
    ? sessions
    : sessions.filter((s) => !isHidden(s.projectPath || s.projectName))

  const sessionMonth = (timestamp: number) => { const d = new Date(timestamp); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  const months = [...new Set(visible.map(s => sessionMonth(s.startedAt)))].sort().reverse()
  const filtered = visible.filter(s => month === 'all' || sessionMonth(s.startedAt) === month).filter(s => !query || [maskName(s.projectPath || s.projectName, s.projectName), s.model, s.provider, sessionMonth(s.startedAt)].join(' ').toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'tokens' ? totalTokens(b.tokenUsage) - totalTokens(a.tokenUsage) : sort === 'cost' ? b.estimatedCost - a.estimatedCost : b.lastMessageAt - a.lastMessageAt)
  const displayed = filtered.slice(0, limit)

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">{title}</div>
        <div className="text-xs text-gray-600 text-center py-4">No sessions found</div>
      </div>
    )
  }

  return (
    <div>
      {fullHeight && <div className="history-controls"><input aria-label="Search sessions" placeholder="Search projects, models, providers…" value={query} onChange={e => { setQuery(e.target.value); setLimit(maxItems) }} /><select aria-label="History month" value={month} onChange={e => { setMonth(e.target.value); setLimit(maxItems) }}><option value="all">All dates</option>{months.map(m => <option key={m} value={m}>{m}</option>)}</select><select aria-label="Sort sessions" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Most recent</option><option value="tokens">Most tokens</option><option value="cost">Highest estimate</option></select></div>}
      <div className="px-4 pt-3 pb-1">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          {title} ({filtered.length})
        </div>
      </div>
      <div className={fullHeight ? undefined : 'max-h-80 overflow-y-auto'}>
        {displayed.map((s) => {
          const key = s.projectPath || s.projectName
          const hidden = isHidden(key)
          const name = maskName(key, s.projectName)
          return (
            <div
              key={s.sessionId}
              className={`px-4 py-2.5 border-b border-panel-border last:border-b-0 hover:bg-panel-hover transition-colors ${
                hidden ? 'opacity-60' : ''
              }`}
            >
              {/* Row 1: project name + badge */}
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-medium truncate flex-1 ${hidden ? 'italic text-gray-400' : ''}`}>
                  {name}
                </span>
                {hidden && (
                  <span className="text-[8px] uppercase tracking-wider text-gray-500 bg-panel-border/60 px-1 py-0.5 rounded shrink-0">
                    hidden
                  </span>
                )}
                <EntrypointBadge entrypoint={s.entrypoint} />
              </div>

              {/* Row 2: slug + branch — hide when project is hidden */}
              {!hidden && (
                <div className="flex items-center gap-2 mb-1">
                  {s.slug && (
                    <span className="text-[9px] text-gray-600 font-mono truncate">{s.slug}</span>
                  )}
                  {s.gitBranch && s.gitBranch !== 'main' && s.gitBranch !== 'master' && (
                    <span className="text-[9px] text-accent-orange bg-accent-orange/10 px-1 py-0.5 rounded font-mono truncate max-w-[120px]">
                      {s.gitBranch}
                    </span>
                  )}
                </div>
              )}

              {/* Row 3: metrics */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-400">
                <span title={new Date(s.startedAt).toLocaleString()}>{new Date(s.startedAt).toLocaleDateString()} · {formatRelativeTime(s.startedAt)}</span>
                {s.dataQuality !== 'history-only' && <span>{formatDuration(s.activeTimeMs)} active</span>}
                {s.historySource !== 'desktop' && <span>{s.messageCount} {s.dataQuality === 'history-only' ? 'recorded prompts' : 'msgs'}</span>}
                <span>{s.dataQuality === 'history-only' ? 'Historical entry · tokens unavailable' : `${formatTokenCount(totalTokens(s.tokenUsage))} tokens`}</span>
                {s.dataQuality !== 'history-only' && <span>{s.costKnown ? formatCost(s.estimatedCost) : s.estimatedCost > 0 ? `${formatCost(s.estimatedCost)} + unpriced` : 'Unpriced'}</span>}
                {!hidden && (s.webSearches > 0 || s.webFetches > 0) && (
                  <span className="text-gray-600">
                    {s.webSearches > 0 ? `${s.webSearches} searches` : ''}
                    {s.webSearches > 0 && s.webFetches > 0 ? ' · ' : ''}
                    {s.webFetches > 0 ? `${s.webFetches} fetches` : ''}
                  </span>
                )}
                {s.dataQuality !== 'history-only' && <span className="text-gray-600">{formatModelName(s.model)}</span>}
              </div>
            </div>
          )
        })}
      </div>
      {displayed.length === 0 && <p className="empty-state">No sessions match this search.</p>}
      {filtered.length > limit && <button className="load-more" onClick={() => setLimit(limit + maxItems)}>Show more ({filtered.length - limit} remaining)</button>}
    </div>
  )
}
