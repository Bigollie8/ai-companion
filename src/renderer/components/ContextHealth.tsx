import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { SessionSummary } from '../lib/types'
import { formatTokenCount, formatRelativeTime } from '../lib/formatters'
import { usePrivacy } from '../lib/privacy'

interface Props {
  sessions: SessionSummary[]
}

const CONTEXT_WINDOW = 200_000

function scoreColor(score: number): string {
  if (score >= 80) return 'text-accent-green'
  if (score >= 50) return 'text-accent-orange'
  return 'text-red-400'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Needs attention'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-accent-green/15'
  if (score >= 50) return 'bg-accent-orange/15'
  return 'bg-red-400/15'
}

function ContextSparkline({ session }: { session: SessionSummary }) {
  if (session.contextPoints.length < 2) return null

  const data = session.contextPoints.map((p, i) => ({
    i,
    pct: Math.round(p.contextPct)
  }))

  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 0 }}>
        <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="2 2" strokeWidth={1} />
        <Line
          type="monotone"
          dataKey="pct"
          stroke="#6c8cff"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-panel-bg border border-panel-border rounded px-2 py-1 text-[10px] text-gray-300">
                {payload[0].value}% of context
              </div>
            )
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ContextHealth({ sessions }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const { isHidden, showHidden, maskName } = usePrivacy()

  // Only show sessions with enough context data.
  // Stats below still use the FULL set so aggregate scores include hidden projects.
  const relevant = sessions
    .filter((s) => s.contextPoints.length > 0)
    .filter((s) => showHidden || !isHidden(s.projectPath || s.projectName))
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    .slice(0, 20)

  if (relevant.length === 0) return null

  // Overall stats
  const totalCompactions = sessions.reduce((s, x) => s + x.autoCompactions, 0)
  const measured = sessions.filter(s => s.contextPoints.length > 0)
  const avgScore = Math.round(measured.reduce((s, x) => s + x.contextEfficiencyScore, 0) / (measured.length || 1))
  const avgPeak = measured.reduce((s, x) => s + x.peakContextPct, 0) / (measured.length || 1)

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Context Management
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-panel-card border border-panel-border rounded-lg p-2 text-center">
          <div className={`text-base font-semibold ${scoreColor(avgScore)}`}>{avgScore}</div>
          <div className="text-[9px] text-gray-500">Heuristic score</div>
        </div>
        <div className="bg-panel-card border border-panel-border rounded-lg p-2 text-center">
          <div className="text-base font-semibold text-gray-200">{avgPeak.toFixed(0)}%</div>
          <div className="text-[9px] text-gray-500">Avg peak ctx</div>
        </div>
        <div className="bg-panel-card border border-panel-border rounded-lg p-2 text-center">
          <div className={`text-base font-semibold ${totalCompactions > 0 ? 'text-accent-orange' : 'text-accent-green'}`}>
            {totalCompactions}
          </div>
          <div className="text-[9px] text-gray-500">Auto compacts</div>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mb-3">Heuristic based on context pressure and compactions; not a measure of work quality. Claude assumes a 200K window; Codex uses the recorded window.</p>
      {/* Scoring legend */}
      <div className="flex gap-3 mb-3">
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-green inline-block" /> 80–100 Good
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-orange inline-block" /> 50–79 Fair
        </span>
        <span className="text-[9px] text-gray-600 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> &lt;50 Poor
        </span>
      </div>

      {/* Per-session list */}
      <div className="space-y-1">
        {relevant.map((s) => (
          <div key={s.sessionId} className="border border-panel-border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-panel-hover transition-colors text-left"
              onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}
            >
              {/* Score badge */}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreBg(s.contextEfficiencyScore)} ${scoreColor(s.contextEfficiencyScore)} shrink-0`}>
                {s.contextEfficiencyScore}
              </span>

              <div className="flex-1 min-w-0">
                <div className={`text-[11px] font-medium truncate ${isHidden(s.projectPath || s.projectName) ? 'italic text-gray-400' : ''}`}>
                  {maskName(s.projectPath || s.projectName, s.projectName)}
                </div>
                <div className="flex gap-2 text-[9px] text-gray-500">
                  <span>{formatRelativeTime(s.startedAt)}</span>
                  <span>peak {s.peakContextPct.toFixed(0)}%</span>
                  <span>avg {s.avgContextPct.toFixed(0)}%</span>
                  {s.autoCompactions > 0 && (
                    <span className="text-accent-orange">{s.autoCompactions} compact{s.autoCompactions > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

              <svg
                className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded === s.sessionId ? 'rotate-90' : ''}`}
                fill="currentColor" viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {expanded === s.sessionId && (
              <div className="px-3 pb-3 border-t border-panel-border bg-panel-card/30">
                {/* Context utilization chart */}
                <div className="mt-2 mb-1">
                  <div className="text-[9px] text-gray-500 mb-1">Context utilization over session (% of session window)</div>
                  <ContextSparkline session={s} />
                  <div className="text-[8px] text-amber-500 mt-0.5">— 80% warning threshold</div>
                </div>

                {/* Detail stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] mt-2">
                  <div className="text-gray-500">Peak context</div>
                  <div className="text-gray-300">{formatTokenCount(s.peakContextTokens)} ({s.peakContextPct.toFixed(1)}%)</div>
                  <div className="text-gray-500">Avg context</div>
                  <div className="text-gray-300">{s.avgContextPct.toFixed(1)}%</div>
                  <div className="text-gray-500">Auto compactions</div>
                  <div className={s.autoCompactions > 0 ? 'text-accent-orange' : 'text-accent-green'}>
                    {s.autoCompactions === 0 ? 'None' : s.autoCompactions}
                  </div>
                  <div className="text-gray-500">Context turns</div>
                  <div className="text-gray-300">{s.contextPoints.length}</div>
                  <div className="text-gray-500">Score</div>
                  <div className={scoreColor(s.contextEfficiencyScore)}>
                    {s.contextEfficiencyScore}/100 — {scoreLabel(s.contextEfficiencyScore)}
                  </div>
                </div>

                {/* Tip if score is low */}
                {s.contextEfficiencyScore < 70 && (
                  <div className="mt-2 text-[9px] text-gray-500 bg-panel-border/30 rounded p-2">
                    {s.autoCompactions > 0
                      ? `This session was auto-compacted ${s.autoCompactions}x. Try using /compact manually before hitting 80% to keep context lean.`
                      : 'High average context — consider breaking long sessions into focused sub-sessions.'}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
