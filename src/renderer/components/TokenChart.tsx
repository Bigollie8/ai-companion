import React from 'react'
import { format, subDays } from 'date-fns'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { DailyMetrics } from '../lib/types'
import { formatTokenCount, formatCost } from '../lib/formatters'

interface Props {
  dailyMetrics: DailyMetrics[]
}

export function TokenChart({ dailyMetrics }: Props) {
  // Show last 14 days
  const days = new Map(dailyMetrics.map(d => [d.date, d]))
  const data = Array.from({ length: 14 }, (_, i) => {
    const date = format(subDays(new Date(), 13 - i), 'yyyy-MM-dd')
    const d = days.get(date) || { date, hasTokenData: false, tokenUsage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }, cost: 0, sessionCount: 0 }
    return ({
    date: d.date.slice(5), // MM-DD
    tokens: d.hasTokenData === false && d.sessionCount > 0 ? null :
      d.tokenUsage.inputTokens +
      d.tokenUsage.outputTokens +
      d.tokenUsage.cacheCreationTokens +
      d.tokenUsage.cacheReadTokens,
    cost: d.cost,
    sessions: d.sessionCount
  })})

  if (data.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
          Token Usage (14d)
        </div>
        <div className="text-xs text-gray-600 text-center py-6">No data yet</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Token Usage (14d)
      </div>
      <div className="h-48 token-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--faint)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--faint)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatTokenCount(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--raised)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 11,
                color: 'var(--text)'
              }}
              formatter={(raw, name) => {
                const value = Number(raw) || 0
                if (name === 'tokens') return [formatTokenCount(value), 'Tokens']
                if (name === 'cost') return [formatCost(value), 'Cost']
                return [value, String(name || '')]
              }}
            />
            <Area
              type="monotone"
              dataKey="tokens"
              stroke="var(--accent)"
              strokeWidth={2}
              isAnimationActive={false}
              fill="url(#tokenGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
