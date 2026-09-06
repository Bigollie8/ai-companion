import React, { useState } from 'react'
import type { ProjectSummary } from '../lib/types'
import {
  formatTokenCount,
  formatCost,
  formatDuration,
  totalTokens
} from '../lib/formatters'
import { usePrivacy, HIDDEN_LABEL } from '../lib/privacy'

interface Props {
  projects: ProjectSummary[]
  fullHeight?: boolean
}

function EyeOffIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.6 9.6 0 0112 5c5 0 9.27 3.11 11 7.5a11.73 11.73 0 01-4.22 5.19M6.61 6.61A11.72 11.72 0 001 12.5C2.73 16.89 7 20 12 20a9.6 9.6 0 004.12-.91" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M1 12.5C2.73 8.11 7 5 12 5s9.27 3.11 11 7.5C21.27 16.89 17 20 12 20S2.73 16.89 1 12.5z" />
      <circle cx="12" cy="12.5" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  const [expanded, setExpanded] = useState(false)
  const { isHidden, toggleHidden, maskName } = usePrivacy()
  const key = project.projectPath || project.projectName
  const hidden = isHidden(key)
  const displayName = maskName(key, project.projectName)
  const tokens = totalTokens(project.totalTokens)

  return (
    <div className={`border-b border-panel-border last:border-b-0 group ${hidden ? 'opacity-60' : ''}`}>
      <div className="relative flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-2 hover:bg-panel-hover transition-colors text-left"
        >
          <svg
            className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-medium truncate ${hidden ? 'italic text-gray-400' : ''}`}>
                {displayName}
              </span>
              {hidden && (
                <span className="text-[8px] uppercase tracking-wider text-gray-500 bg-panel-border/60 px-1 py-0.5 rounded">
                  hidden
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-0.5 text-[10px] text-gray-500">
              <span>{project.sessionCount} sessions</span>
              <span>{project.historyOnlySessions === project.sessionCount ? 'Usage unavailable' : `${formatTokenCount(tokens)} recorded tokens`}</span>
              {project.historyOnlySessions !== project.sessionCount && <span>{formatCost(project.totalCost)} est.</span>}
            </div>
          </div>
        </button>

        {/* Hide / Unhide toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleHidden(key)
          }}
          aria-label={hidden ? 'Unhide project' : 'Hide project'}
          title={hidden ? 'Unhide project' : 'Hide project from listings'}
          className={`shrink-0 mr-2 p-1.5 rounded text-gray-500 hover:text-accent-blue hover:bg-panel-hover transition-opacity ${
            hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          {hidden ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-2 ml-5">
          {!!project.historyOnlySessions && <p className="text-xs text-gray-500 mb-3">{project.historyOnlySessions} historical entries have no detailed token or cost records. Totals below cover available transcripts only.</p>}
          {project.historyOnlySessions !== project.sessionCount && <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <div className="text-gray-500">Total Time</div>
            <div className="text-gray-300">{formatDuration(project.totalDurationMs)}</div>
            <div className="text-gray-500">Active Time</div>
            <div className="text-gray-300">{formatDuration(project.totalActiveTimeMs)}</div>
            <div className="text-gray-500">Messages</div>
            <div className="text-gray-300">{project.totalMessages}</div>
            <div className="text-gray-500">Input Tokens</div>
            <div className="text-gray-300">{formatTokenCount(project.totalTokens.inputTokens)}</div>
            <div className="text-gray-500">Output Tokens</div>
            <div className="text-gray-300">{formatTokenCount(project.totalTokens.outputTokens)}</div>
            <div className="text-gray-500">Cache Write</div>
            <div className="text-gray-300">
              {formatTokenCount(project.totalTokens.cacheCreationTokens)}
            </div>
            <div className="text-gray-500">Cache Read</div>
            <div className="text-gray-300">
              {formatTokenCount(project.totalTokens.cacheReadTokens)}
            </div>
          </div>}

          {!hidden && project.branches.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] text-gray-500 font-medium mb-1">Branches</div>
              <div className="flex flex-wrap gap-1">
                {project.branches.slice(0, 6).map((b) => (
                  <span key={b} className="text-[9px] text-accent-orange bg-accent-orange/10 px-1.5 py-0.5 rounded font-mono">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!hidden && project.sessions.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] text-gray-500 font-medium">Recent Sessions</div>
              {project.sessions.slice(0, 5).map((s) => (
                <div key={s.sessionId} className="text-[10px] text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">
                      {new Date(s.startedAt).toLocaleDateString()}
                    </span>
                    {s.dataQuality !== 'history-only' && <span>{formatDuration(s.activeTimeMs)} active</span>}
                    <span className="ml-auto">{s.dataQuality === 'history-only' ? 'Usage unavailable' : s.costKnown ? formatCost(s.estimatedCost) : 'Unpriced / partial'}</span>
                  </div>
                  {s.slug && (
                    <div className="text-[9px] text-gray-600 font-mono ml-0 mt-0.5">{s.slug}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {hidden && (
            <div className="mt-2 text-[10px] text-gray-500 italic">
              Session details, branches, and slugs are hidden. Tokens and cost still count toward all totals.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProjectList({ projects, fullHeight = false }: Props) {
  const { isHidden, showHidden, setShowHidden, hiddenCount } = usePrivacy()

  const visible = showHidden
    ? projects
    : projects.filter((p) => !isHidden(p.projectPath || p.projectName))

  if (visible.length === 0 && hiddenCount === 0) {
    return (
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-medium">
          Projects
        </div>
        <div className="text-xs text-gray-600 text-center py-4">No projects found</div>
      </div>
    )
  }

  return (
    <div>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          Projects ({visible.length}
          {hiddenCount > 0 && !showHidden ? ` · ${hiddenCount} hidden` : ''})
        </div>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-[9px] uppercase tracking-wider text-gray-500 hover:text-accent-blue transition-colors px-1.5 py-0.5 rounded"
            title={showHidden ? 'Hide hidden projects again' : 'Show hidden projects'}
          >
            {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
          </button>
        )}
      </div>
      <div className={fullHeight ? undefined : 'max-h-64 overflow-y-auto'}>
        {visible.map((p) => (
          <ProjectRow key={p.projectPath || p.projectName} project={p} />
        ))}
      </div>
    </div>
  )
}
