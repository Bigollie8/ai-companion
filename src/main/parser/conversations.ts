import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { TokenUsage, ChatAttention } from './types'
import { parseChatAttention } from './attention'
import { calculateCost, MODEL_PRICING } from '../pricing'

const PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const CONTEXT_WINDOW = 200_000

export interface ParsedMessage {
  type: 'user' | 'assistant' | 'activity'
  timestamp: number
  model?: string
  tokenUsage?: TokenUsage
  cost?: number
  cacheSavings?: number
  webSearches?: number
  webFetches?: number
  contextTokens?: number  // total context size this turn
  contextPct?: number     // as % of context window
}

export interface ParsedSession {
  attention?: ChatAttention
  dataQuality?: 'full' | 'history-only'
  historySource?: 'history' | 'desktop'
  provider?: 'claude' | 'codex'
  costKnown?: boolean
  sessionId: string
  projectPath: string
  projectName: string
  entrypoint: string
  gitBranch: string
  slug: string
  messages: ParsedMessage[]
  totalTokens: TokenUsage
  totalCost: number
  totalCacheSavings: number
  totalWebSearches: number
  totalWebFetches: number
  primaryModel: string
  autoCompactions: number
}

export function deriveProjectName(cwd: string): string {
  if (!cwd) return 'Unknown'
  const parts = cwd.split(/[\\/]/)
  const meaningful = parts.filter((p) => p && p !== 'Users' && p !== 'Documents' && p !== 'Github')
  if (meaningful.length >= 2) return meaningful.slice(-2).join('/')
  return meaningful[meaningful.length - 1] || 'Home'
}

function computeCacheSavings(model: string, cacheReadTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing || cacheReadTokens === 0) return 0
  return cacheReadTokens * (pricing.input - pricing.cacheRead)
}

export function parseJsonlFile(filePath: string): ParsedSession | null {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const records: any[] = []
    const latest = new Map<string, any>()
    for (const line of content.split('\n')) {
      try {
        const record = JSON.parse(line)
        if (!record || typeof record !== 'object') continue
        records.push(record)
        if (record.type === 'assistant' && record.message?.usage && record.message.id) {
          latest.set(record.message.id, record)
        }
      } catch { /* incomplete JSONL */ }
    }

    const messages: ParsedMessage[] = []
    let projectPath = ''
    let projectName = ''
    let entrypoint = ''
    let sessionId = ''
    let gitBranch = ''
    let slug = ''
    let autoCompactions = 0
    const modelCounts = new Map<string, number>()
    const totalTokens: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0
    }
    let totalCost = 0
    let totalCacheSavings = 0
    let totalWebSearches = 0
    let totalWebFetches = 0
    let costKnown = true

    for (const record of records) {
      try {

        // Capture session metadata from any record
        if (!projectPath && record.cwd) {
          projectPath = record.cwd
          projectName = deriveProjectName(record.cwd)
        }
        if (!entrypoint && record.entrypoint) entrypoint = record.entrypoint
        if (!sessionId && record.sessionId) sessionId = record.sessionId
        if (!gitBranch && record.gitBranch && record.gitBranch !== 'HEAD') {
          gitBranch = record.gitBranch
        }
        if (!slug && record.slug) slug = record.slug

        // Count auto-compaction events
        if (record.type === 'system' && record.subtype === 'compact_boundary') {
          if (record.compactMetadata?.trigger === 'auto') autoCompactions++
        }

        if (record.type === 'assistant' && record.message?.usage) {
          if (record.message.id && latest.get(record.message.id) !== record) continue
          const usage = record.message.usage
          const model = record.message.model || 'unknown'
          const timestamp = new Date(record.timestamp).getTime()
          if (!Number.isFinite(timestamp)) continue

          const inputTokens = usage.input_tokens || 0
          const outputTokens = usage.output_tokens || 0
          const cacheCreationTokens = usage.cache_creation_input_tokens || 0
          const cacheReadTokens = usage.cache_read_input_tokens || 0
          if (!MODEL_PRICING[model] && inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens > 0) costKnown = false
          const webSearches = usage.server_tool_use?.web_search_requests || 0
          const webFetches = usage.server_tool_use?.web_fetch_requests || 0

          // Total context = everything the model "saw" this turn
          const contextTokens = inputTokens + cacheReadTokens + cacheCreationTokens
          const contextPct = (contextTokens / CONTEXT_WINDOW) * 100

          const cost = calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens)
          const savings = computeCacheSavings(model, cacheReadTokens)

          messages.push({
            type: 'assistant',
            timestamp,
            model,
            tokenUsage: { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens },
            cost,
            cacheSavings: savings,
            webSearches,
            webFetches,
            contextTokens,
            contextPct
          })

          totalTokens.inputTokens += inputTokens
          totalTokens.outputTokens += outputTokens
          totalTokens.cacheCreationTokens += cacheCreationTokens
          totalTokens.cacheReadTokens += cacheReadTokens
          totalCost += cost
          totalCacheSavings += savings
          totalWebSearches += webSearches
          totalWebFetches += webFetches

          modelCounts.set(model, (modelCounts.get(model) || 0) + 1)

        } else if (record.type === 'user') {
          const timestamp = new Date(record.timestamp).getTime()
          if (!isNaN(timestamp)) {
            messages.push({ type: 'user', timestamp })
          }
        }
      } catch {
        // Skip malformed lines (e.g. partially written last line)
      }
    }

    if (messages.length === 0) return null

    if (!sessionId) sessionId = basename(filePath, '.jsonl')

    // Primary model = most-used model
    let primaryModel = 'unknown'
    let maxCount = 0
    for (const [model, count] of modelCounts) {
      if (count > maxCount) { primaryModel = model; maxCount = count }
    }

    messages.sort((a, b) => a.timestamp - b.timestamp)

    return {
      attention: parseChatAttention(records, 'claude'),
      provider: 'claude',
      costKnown,
      sessionId,
      projectPath,
      projectName,
      entrypoint,
      gitBranch: gitBranch || 'main',
      slug,
      messages,
      totalTokens,
      totalCost,
      totalCacheSavings,
      totalWebSearches,
      totalWebFetches,
      primaryModel,
      autoCompactions
    }
  } catch {
    return null
  }
}

const fileCache = new Map<string, { stamp: string; parsed: ParsedSession | null }>()

export function parseAllConversations(): ParsedSession[] {
  const sessions: ParsedSession[] = []
  const seen = new Set<string>()

  if (!existsSync(PROJECTS_DIR)) return sessions

  try {
    const projectDirs = readdirSync(PROJECTS_DIR).filter((d) => {
      try { return statSync(join(PROJECTS_DIR, d)).isDirectory() } catch { return false }
    })

    for (const dir of projectDirs) {
      const dirPath = join(PROJECTS_DIR, dir)
      try {
        const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'))
        for (const file of files) {
          const filePath = join(dirPath, file)
          seen.add(filePath)
          const stat = statSync(filePath), stamp = stat.size + ':' + stat.mtimeMs
          let entry = fileCache.get(filePath)
          if (!entry || entry.stamp !== stamp) {
            entry = { stamp, parsed: parseJsonlFile(filePath) }
            fileCache.set(filePath, entry)
          }
          if (entry.parsed) sessions.push(entry.parsed)
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  for (const file of fileCache.keys()) if (!seen.has(file)) fileCache.delete(file)
  return sessions
}
