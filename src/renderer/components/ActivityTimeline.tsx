import React from 'react'
import type { SessionSummary } from '../lib/types'
import { formatModelName } from '../lib/formatters'
import { usePrivacy } from '../lib/privacy'

interface Props {
  sessions: SessionSummary[]
}

const HOUR_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p']

export function ActivityTimeline({ sessions }: Props) {
  const { maskName } = usePrivacy()
  // Build today's 24-hour timeline
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const todayEnd = tomorrow.getTime()

  const todaySessions = sessions.filter(
    (s) => s.lastMessageAt >= todayStart && s.startedAt < todayEnd
  )

  return (
    <div className="px-4 py-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
        Today's Activity
      </div>

      {/* Hour markers */}
      <div className="relative h-6 mb-1">
        <div className="flex justify-between text-[9px] text-gray-600">
          {HOUR_LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative h-4 bg-panel-card rounded-full border border-panel-border overflow-hidden">
        {todaySessions.map((s) => {
          const start = Math.max(s.startedAt, todayStart)
          const end = Math.min(s.lastMessageAt, todayEnd)
          const leftPct = ((start - todayStart) / (todayEnd - todayStart)) * 100
          const widthPct = Math.max(((end - start) / (todayEnd - todayStart)) * 100, 0.5)

          const color =
            s.provider === 'codex' ? '#8ad6b8' : s.model.includes('opus')
              ? '#a78bfa'
              : s.model.includes('haiku')
                ? '#4ade80'
                : '#6c8cff'

          return (
            <div
              key={s.sessionId}
              className="absolute top-0 h-full rounded-full opacity-80"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: color,
                minWidth: 3
              }}
              title={`${maskName(s.projectPath || s.projectName, s.projectName)} (${formatModelName(s.model)})`}
            />
          )
        })}

        {/* Current time marker */}
        {Date.now() >= todayStart && Date.now() < todayEnd && (
          <div
            className="absolute top-0 h-full w-px bg-white/50"
            style={{
              left: `${((Date.now() - todayStart) / (todayEnd - todayStart)) * 100}%`
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-2 text-[9px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-blue" /> Sonnet / other
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-purple" /> Opus
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-green" /> Haiku
        </span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#8ad6b8' }} /> Codex</span>
      </div>
      <p className="text-[9px] text-gray-600 mt-2">Session spans include idle gaps.</p>
    </div>
  )
}
