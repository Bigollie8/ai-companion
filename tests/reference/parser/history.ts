import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { RawHistoryEntry } from './types'

const HISTORY_PATH = join(homedir(), '.claude', 'history.jsonl')

export interface HistorySession {
  sessionId: string
  projectPath: string
  firstTimestamp: number
  lastTimestamp: number
  messageCount: number
  timestamps: number[]
}

export function parseHistory(filePath = HISTORY_PATH): Map<string, HistorySession> {
  const sessions = new Map<string, HistorySession>()

  if (!existsSync(filePath)) return sessions

  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim())

    for (const line of lines) {
      try {
        const entry: RawHistoryEntry = JSON.parse(line)
        if (typeof entry.sessionId !== 'string' || !Number.isFinite(entry.timestamp) || entry.timestamp <= 0) continue

        const existing = sessions.get(entry.sessionId)
        if (existing) {
          existing.lastTimestamp = Math.max(existing.lastTimestamp, entry.timestamp)
          existing.firstTimestamp = Math.min(existing.firstTimestamp, entry.timestamp)
          existing.messageCount++
          existing.timestamps.push(entry.timestamp)
        } else {
          sessions.set(entry.sessionId, {
            sessionId: entry.sessionId,
            projectPath: entry.project || '',
            firstTimestamp: entry.timestamp,
            lastTimestamp: entry.timestamp,
            messageCount: 1,
            timestamps: [entry.timestamp]
          })
        }
      } catch {
        // Skip malformed lines (e.g. partial writes)
      }
    }
  } catch {
    // File read error
  }

  return sessions
}
