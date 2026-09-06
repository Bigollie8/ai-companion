import { watch, type FSWatcher } from 'chokidar'
import { join } from 'path'
import { homedir } from 'os'
import type { BrowserWindow } from 'electron'
import { CODEX_HOME } from './parser/codex'
import { CLAUDE_STATS_PATH, claudeDesktopSessionRoots } from './parser/claudeArchive'
import { aggregateAllData } from './parser/aggregator'

const CLAUDE_DIR = join(homedir(), '.claude')
let watcher: FSWatcher | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 800

function sendUpdate(window: BrowserWindow): void {
  try {
    const data = aggregateAllData()
    if (!window.isDestroyed()) {
      window.webContents.send('data:update', data)
    }
  } catch (err) {
    console.error('Failed to aggregate data:', err)
  }
}

export function startWatcher(window: BrowserWindow): void {
  // Send initial data
  sendUpdate(window)

  refreshTimer = setInterval(() => sendUpdate(window), 60000)

  // Watch for changes
  watcher = watch(
    [
      join(CLAUDE_DIR, 'history.jsonl'),
      CLAUDE_STATS_PATH,
      ...claudeDesktopSessionRoots(),
      join(CLAUDE_DIR, 'sessions'),
      join(CLAUDE_DIR, 'projects'),
      join(CODEX_HOME, 'sessions'),
      join(CODEX_HOME, 'archived_sessions')
    ],
    {
      ignoreInitial: true,
      persistent: true,
      depth: 6,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    }
  )

  const debouncedUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => sendUpdate(window), DEBOUNCE_MS)
  }

  watcher.on('change', debouncedUpdate)
  watcher.on('add', debouncedUpdate)
  watcher.on('unlink', debouncedUpdate)
}

export function stopWatcher(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  if (debounceTimer) clearTimeout(debounceTimer)
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

export { sendUpdate }
