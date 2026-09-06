import React from 'react'
import type { SessionSummary } from '../lib/types'
import { formatCost, formatTokenCount } from '../lib/formatters'

interface Props {
  sessions: SessionSummary[]
}

export function CacheEfficiency({ sessions }: Props) {
  let totalInput = 0
  let totalCacheRead = 0
  let totalCacheWrite = 0
  let totalSavings = 0

  for (const s of sessions) {
    totalInput += s.tokenUsage.inputTokens
    totalCacheRead += s.tokenUsage.cacheReadTokens
    totalCacheWrite += s.tokenUsage.cacheCreationTokens
    totalSavings += s.cacheSavings
  }

  const totalCacheable = totalInput + totalCacheRead + totalCacheWrite
  const hitRate = totalCacheable > 0 ? (totalCacheRead / totalCacheable) * 100 : 0

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Cache Efficiency
      </div>

      {/* Hit rate bar */}
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-gray-400">Cache hit rate</span>
        <span className="font-medium text-accent-green">{hitRate.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-panel-border rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-accent-green rounded-full transition-all"
          style={{ width: `${hitRate}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[9px] text-gray-500 mb-0.5">Cache reads</div>
          <div className="text-[11px] font-medium text-gray-300">{formatTokenCount(totalCacheRead)}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-0.5">Cache writes</div>
          <div className="text-[11px] font-medium text-gray-300">{formatTokenCount(totalCacheWrite)}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-0.5">Saved</div>
          <div className="text-[11px] font-medium text-accent-green">{formatCost(totalSavings)}</div>
        </div>
      </div>
    </div>
  )
}
