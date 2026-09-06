import React from 'react'
import type { SessionSummary } from '../lib/types'
import { formatTokenCount, formatCost, formatModelName } from '../lib/formatters'

interface Props {
  sessions: SessionSummary[]
}

const MODEL_COLORS: Record<string, string> = {
  Opus: '#a78bfa',
  Sonnet: '#6c8cff',
  Haiku: '#4ade80'
}

export function ModelDistribution({ sessions }: Props) {
  const modelStats = new Map<string, { tokens: number; cost: number; sessions: number }>()

  for (const s of sessions.filter(s => s.dataQuality !== 'history-only')) {
    const name = formatModelName(s.model)
    const existing = modelStats.get(name) || { tokens: 0, cost: 0, sessions: 0 }
    existing.tokens +=
      s.tokenUsage.inputTokens +
      s.tokenUsage.outputTokens +
      s.tokenUsage.cacheCreationTokens +
      s.tokenUsage.cacheReadTokens
    existing.cost += s.estimatedCost
    existing.sessions++
    modelStats.set(name, existing)
  }

  const entries = Array.from(modelStats.entries()).sort((a, b) => b[1].tokens - a[1].tokens)
  const totalSessions = sessions.filter(s => s.dataQuality !== 'history-only').length

  if (entries.length === 0) return null

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Model Usage
      </div>
      <p className="text-[10px] text-gray-500 mb-3">Grouped by the most-used model in each session. Dollar values cover known rates.</p>
      <div className="space-y-2">
        {entries.map(([name, stats]) => {
          const pct = totalSessions > 0 ? (stats.sessions / totalSessions) * 100 : 0
          const color = MODEL_COLORS[name] || '#6b7280'
          return (
            <div key={name}>
              <div className="flex flex-wrap gap-2 items-center justify-between text-[10px] mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-gray-300 font-medium">{name}</span>
                  <span className="text-gray-600">{stats.sessions} sessions</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{formatTokenCount(stats.tokens)}</span>
                  <span className="text-gray-300">{formatCost(stats.cost)}</span>
                </div>
              </div>
              <div className="h-1 bg-panel-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
