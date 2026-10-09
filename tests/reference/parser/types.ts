export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export interface ContextPoint {
  timestamp: number
  contextTokens: number  // input + cache_read + cache_creation = total context size
  contextPct: number     // as % of 200k window
}

export interface ChatAttention {
  requestId: string
  requestedAt: number
  kind: 'question' | 'approval'
}

export interface SessionSummary {
  attention?: ChatAttention
  dataQuality?: 'full' | 'history-only'
  historySource?: 'history' | 'desktop'
  provider: 'claude' | 'codex'
  costKnown: boolean
  sessionId: string
  projectName: string
  projectPath: string
  startedAt: number
  lastMessageAt: number
  durationMs: number
  activeTimeMs: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  model: string
  tokenUsage: TokenUsage
  estimatedCost: number
  cacheSavings: number
  entrypoint: string
  gitBranch: string
  slug: string
  webSearches: number
  webFetches: number
  // Context tracking
  peakContextTokens: number
  peakContextPct: number
  avgContextPct: number
  autoCompactions: number
  contextEfficiencyScore: number  // 0–100
  contextPoints: ContextPoint[]   // time-series for charting
}

export interface ProjectSummary {
  historyOnlySessions?: number
  projectName: string
  projectPath: string
  sessionCount: number
  totalDurationMs: number
  totalActiveTimeMs: number
  totalTokens: TokenUsage
  totalCost: number
  totalMessages: number
  branches: string[]
  sessions: SessionSummary[]
}

export interface DailyMetrics {
  hasTokenData?: boolean
  historyOnlySessionCount?: number
  date: string
  tokenUsage: TokenUsage
  cost: number
  cacheSavings: number
  sessionCount: number
  messageCount: number
  activeProjects: string[]
  webSearches: number
  webFetches: number
}

export interface WeekMetrics {
  tokens: number
  cost: number
  sessions: number
  activeTimeMs: number
}

export interface DashboardSnapshot {
  claudeArchive?: ClaudeArchive | null
  sessions: SessionSummary[]
  projects: ProjectSummary[]
  dailyMetrics: DailyMetrics[]
  streak: number
  firstSessionAt: number
  allTimeActiveMs: number
  weekComparison: { thisWeek: WeekMetrics; lastWeek: WeekMetrics }
  lastUpdated: number
}

export interface ClaudeArchive {
  firstSessionAt: number
  throughDate: string
  sessionCount: number
  messageCount: number
  tokenUsage: TokenUsage
  models: { model: string; tokenUsage: TokenUsage }[]
  dailyActivity: { date: string; sessionCount: number; messageCount: number }[]
}

export interface UsageLimit {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
}

export interface CodexLimits {
  observedAt: number
  primary: UsageLimit | null
  secondary: UsageLimit | null
}

export interface DashboardData extends DashboardSnapshot {
  providers: Record<'claude' | 'codex', DashboardSnapshot>
  codexLimits: CodexLimits | null
  claudeLimits: CodexLimits | null
}

// Raw record types from Claude's JSONL files
export interface RawAssistantRecord {
  type: 'assistant'
  uuid: string
  timestamp: string
  sessionId: string
  cwd: string
  entrypoint?: string
  gitBranch?: string
  slug?: string
  message: {
    model: string
    role: 'assistant'
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
      server_tool_use?: {
        web_search_requests?: number
        web_fetch_requests?: number
      }
    }
  }
}

export interface RawUserRecord {
  type: 'user'
  uuid: string
  timestamp: string
  sessionId: string
  cwd: string
  entrypoint?: string
  gitBranch?: string
  slug?: string
  message: {
    role: 'user'
  }
}

export interface RawHistoryEntry {
  display: string
  timestamp: number
  project: string
  sessionId: string
}

export interface RawSessionMetadata {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  kind: string
  entrypoint: string
}
