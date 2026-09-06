import React, { useState } from 'react'
import { format } from 'date-fns'
import type { DailyMetrics } from '../lib/types'
import { formatCost, formatTokenCount, totalTokens } from '../lib/formatters'
export function ActivityHeatmap({ dailyMetrics }: { dailyMetrics: DailyMetrics[] }) {
  const [metric, setMetric] = useState<'tokens' | 'cost'>('tokens')
  const lookup = new Map(dailyMetrics.map(d => [d.date, d]))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(today); start.setDate(today.getDate() - (today.getDay() + 6) % 7 - 84)
  const cells = Array.from({ length: 91 }, (_, i) => {
    const date = new Date(start); date.setDate(start.getDate() + i)
    const key = format(date, 'yyyy-MM-dd'), day = lookup.get(key)
    return { key, future: date > today, value: day ? metric === 'cost' ? day.cost : totalTokens(day.tokenUsage) : 0 }
  })
  const max = Math.max(1, ...cells.map(c => c.value))
  return <div className="px-4 py-3"><div className="section-heading"><h2>Activity · 13 weeks</h2><select aria-label="Activity heatmap metric" value={metric} onChange={e => setMetric(e.target.value as 'tokens' | 'cost')} className="bg-panel-card text-xs rounded px-2 py-1 border border-panel-border"><option value="tokens">Tokens</option><option value="cost">API estimate</option></select></div>
    <div className="flex gap-1" style={{ maxWidth: 650 }}>
      <div className="flex flex-col gap-1 text-gray-500" style={{ fontSize: 9 }}>{['M', '', 'W', '', 'F', '', 'S'].map((d, i) => <span key={i} style={{ height: 13, width: 12, lineHeight: '13px' }}>{d}</span>)}</div>
      {Array.from({ length: 13 }, (_, col) => <div key={col} className="flex-1 flex flex-col gap-1">{cells.slice(col * 7, col * 7 + 7).map(cell => <div key={cell.key} style={{ height: 13, borderRadius: 3, background: cell.future || !cell.value ? '#27313c' : `rgba(138, 214, 184, ${.2 + .8 * cell.value / max})`, opacity: cell.future ? .3 : 1 }} title={`${cell.key}: ${metric === 'cost' ? formatCost(cell.value) + ' estimated' : formatTokenCount(cell.value) + ' tokens'}`} />)}</div>)}
    </div>
    <div className="flex justify-between mt-3 text-[10px] text-gray-500"><span>{format(start, 'MMM d')} – {format(today, 'MMM d')}</span><span>Darker → less · Brighter → more</span></div>
  </div>
}
