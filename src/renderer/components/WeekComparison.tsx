import React from 'react'
import type { WeekMetrics } from '../lib/types'
import { formatTokenCount, formatCost } from '../lib/formatters'

interface Props {
  thisWeek: WeekMetrics
  lastWeek: WeekMetrics
}

function pctChange(current: number, previous: number): { pct: number; up: boolean } | null {
  if (previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

function Stat({
  label,
  current,
  previous,
  format
}: {
  label: string
  current: number
  previous: number
  format: (n: number) => string
}) {
  const change = pctChange(current, previous)

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-panel-border last:border-0">
      <span className="text-[10px] text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400">{format(previous)}</span>
        <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[10px] font-medium text-gray-200">{format(current)}</span>
        {change && (
          <span
            className={`text-[9px] font-medium ${
              label === 'Cost'
                ? change.up ? 'text-accent-orange' : 'text-accent-green'
                : change.up ? 'text-accent-green' : 'text-gray-500'
            }`}
          >
            {change.up ? '+' : '-'}{change.pct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  )
}

export function WeekComparison({ thisWeek, lastWeek }: Props) {
  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Week over Week</div>
        <div className="flex gap-3 text-[9px] text-gray-600">
          <span>Last</span>
          <span className="text-gray-400">This</span>
        </div>
      </div>
      <Stat label="Sessions" current={thisWeek.sessions} previous={lastWeek.sessions} format={String} />
      <Stat label="Tokens" current={thisWeek.tokens} previous={lastWeek.tokens} format={formatTokenCount} />
      <Stat label="Cost" current={thisWeek.cost} previous={lastWeek.cost} format={formatCost} />
    </div>
  )
}
