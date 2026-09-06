import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { RawSessionMetadata } from './types'

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions')

export function parseSessionMetadata(): Map<string, RawSessionMetadata> {
  const metadata = new Map<string, RawSessionMetadata>()

  if (!existsSync(SESSIONS_DIR)) return metadata

  try {
    const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))

    for (const file of files) {
      try {
        const content = readFileSync(join(SESSIONS_DIR, file), 'utf-8')
        const data: RawSessionMetadata = JSON.parse(content)
        if (data.sessionId) {
          metadata.set(data.sessionId, data)
        }
      } catch {
        // Skip malformed session files
      }
    }
  } catch {
    // Directory read error
  }

  return metadata
}
