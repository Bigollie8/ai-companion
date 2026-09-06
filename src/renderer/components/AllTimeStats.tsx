import React from 'react'
import type { DashboardSnapshot } from '../lib/types'
import { formatTokenCount, formatCost, formatDuration } from '../lib/formatters'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  data: DashboardSnapshot
}

export function AllTimeStats({ data }: Props) {
  const totalTokens = data.sessions.reduce(
    (s, x) =>
      s +
      x.tokenUsage.inputTokens +
      x.tokenUsage.outputTokens +
      x.tokenUsage.cacheCreationTokens +
      x.tokenUsage.cacheReadTokens,
    0
  )
  const totalCost = data.sessions.reduce((s, x) => s + x.estimatedCost, 0)
  const totalSavings = data.sessions.reduce((s, x) => s + x.cacheSavings, 0)
  const totalMessages = data.sessions.reduce((s, x) => s + x.messageCount, 0)
  const totalWebSearches = data.sessions.reduce((s, x) => s + x.webSearches, 0)

  const memberSince =
    data.firstSessionAt > 0
      ? formatDistanceToNow(new Date(data.firstSessionAt), { addSuffix: true })
      : '—'

  // Token velocity: output tokens / active hours
  const activeHours = data.allTimeActiveMs / (1000 * 60 * 60)
  const outputTokens = data.sessions.reduce((s, x) => s + x.tokenUsage.outputTokens, 0)
  const velocity = activeHours > 0 ? Math.round(outputTokens / activeHours) : 0

  const rows = [
    { label: 'First recorded activity', value: memberSince },
    { label: 'Recorded sessions', value: data.sessions.length.toLocaleString() },
    { label: 'History-only sessions', value: data.sessions.filter(s => s.dataQuality === 'history-only').length.toLocaleString() },
    { label: 'Tokens in available transcripts', value: formatTokenCount(totalTokens) },
    { label: 'API estimate (known rates)', value: formatCost(totalCost) },
    { label: 'Cache savings', value: formatCost(totalSavings) },
    { label: 'Active time', value: formatDuration(data.allTimeActiveMs) },
    { label: 'Avg tokens/hr', value: formatTokenCount(velocity) },
    { label: 'Messages sent', value: totalMessages.toLocaleString() },
    { label: 'Web searches', value: totalWebSearches.toLocaleString() },
    { label: 'Projects', value: data.projects.length.toLocaleString() },
  ]

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Available records
      </div>
      <div className="space-y-0">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-1.5 border-b border-panel-border/50 last:border-0">
            <span className="text-[10px] text-gray-500">{label}</span>
            <span className="text-[10px] font-medium text-gray-200">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
