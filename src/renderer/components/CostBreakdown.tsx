import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { SessionSummary } from '../lib/types'
import { formatCost, formatModelName } from '../lib/formatters'
import { usePrivacy, HIDDEN_LABEL } from '../lib/privacy'

interface Props {
  sessions: SessionSummary[]
}

const COLORS = ['#6c8cff', '#a78bfa', '#4ade80', '#fb923c', '#f87171']

export function CostBreakdown({ sessions }: Props) {
  const { isHidden } = usePrivacy()

  // Group by model — known estimates unchanged (hidden projects still count).
  const modelCosts = new Map<string, number>()
  for (const s of sessions.filter(s => s.dataQuality !== 'history-only')) {
    const model = formatModelName(s.model)
    modelCosts.set(model, (modelCosts.get(model) || 0) + s.estimatedCost)
  }

  const modelData = Array.from(modelCosts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Group by project — all hidden projects merge into one "Hidden" bucket so total stays correct.
  const projectCosts = new Map<string, number>()
  for (const s of sessions) {
    const key = s.projectPath || s.projectName
    const label = isHidden(key) ? HIDDEN_LABEL : s.projectName
    projectCosts.set(label, (projectCosts.get(label) || 0) + s.estimatedCost)
  }

  const projectData = Array.from(projectCosts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCost, 0)

  if (sessions.length === 0) {
    return (
      <div className="px-4 py-3 border-t border-panel-border">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
          Cost Breakdown
        </div>
        <div className="text-xs text-gray-600 text-center py-4">No data</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Cost Breakdown &mdash; {formatCost(totalCost)} known estimate
      </div>

      {/* Model breakdown */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-20 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={modelData}
                cx="50%"
                cy="50%"
                innerRadius={18}
                outerRadius={36}
                dataKey="value"
                strokeWidth={0}
                isAnimationActive={false}
              >
                {modelData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d27',
                  border: '1px solid #2a2d3a',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#e5e7eb'
                }}
                formatter={(value) => [formatCost(Number(value) || 0), 'Cost']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-[10px] text-gray-500 font-medium mb-1">By Model</div>
          {modelData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-[10px]">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-gray-300 flex-1">{d.name}</span>
              <span className="text-gray-400">{formatCost(d.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Project breakdown */}
      <div className="text-[10px] text-gray-500 font-medium mb-1">By Project</div>
      <div className="space-y-1.5">
        {projectData.slice(0, 6).map((d) => {
          const pct = totalCost > 0 ? (d.value / totalCost) * 100 : 0
          return (
            <div key={d.name}>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className={`truncate ${d.name === HIDDEN_LABEL ? 'italic text-gray-500' : 'text-gray-300'}`}>
                  {d.name}
                </span>
                <span className="text-gray-400 ml-2">{formatCost(d.value)}</span>
              </div>
              <div className="h-1.5 bg-panel-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-blue rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
