import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'fs'
import { homedir } from 'os'
import { startWatcher, stopWatcher } from './watcher'
import { setupIPC } from './ipc'
import { setupWindowControls } from './windowControls'

app.setName('AI Companion')
const preferenceDir = join(app.getPath('appData'), 'ai-companion')
mkdirSync(preferenceDir, { recursive: true })
app.setPath('userData', preferenceDir)
app.setPath('sessionData', preferenceDir)
if (process.platform === 'win32') app.setAppUserModelId('io.github.bigollie8.ai-companion')
const BOUNDS_FILE = join(preferenceDir, 'dashboard-bounds.json')
// One-time compatibility with the original local dashboard, not a data source.
const legacyDir = join(app.getPath('appData'), 'claude-productivity-monitor')
for (const [source, target] of [
  [join(legacyDir, 'window-state.json'), join(preferenceDir, 'window-state.json')],
  [join(homedir(), '.claude', 'dashboard-bounds.json'), BOUNDS_FILE]
]) {
  try { if (!existsSync(target) && existsSync(source)) copyFileSync(source, target) } catch (error) { console.warn('Could not migrate window settings', error) }
}
try {
  const storage = join(preferenceDir, 'Local Storage')
  if (!existsSync(storage) && existsSync(join(legacyDir, 'Local Storage'))) cpSync(join(legacyDir, 'Local Storage'), storage, { recursive: true })
} catch (error) { console.warn('Could not migrate privacy preferences', error) }
const DEFAULT_WIDTH = 1140
const PANEL_MARGIN = 0

let mainWindow: BrowserWindow | null = null

const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
})

function loadBounds(): Electron.Rectangle | null {
  try {
    if (existsSync(BOUNDS_FILE)) {
      const bounds = JSON.parse(readFileSync(BOUNDS_FILE, 'utf-8'))
      if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) && bounds.width > 0 && bounds.height > 0) return bounds
    }
  } catch {}
  return null
}

function saveBounds(bounds: Electron.Rectangle): void {
  try {
    writeFileSync(BOUNDS_FILE, JSON.stringify(bounds))
  } catch {}
}

function createWindow(): void {
  const savedBounds = loadBounds()
  const display = savedBounds ? screen.getDisplayMatching(savedBounds) : screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: workX, y: workY } = display.workArea

  const winWidth = Math.min(screenWidth, Math.max(360, savedBounds?.width || DEFAULT_WIDTH))
  const winHeight = Math.min(screenHeight, Math.max(360, savedBounds?.height || screenHeight))
  const winX = Math.max(workX, Math.min(savedBounds?.x ?? (workX + screenWidth - winWidth - PANEL_MARGIN), workX + screenWidth - winWidth))
  const winY = Math.max(workY, Math.min(savedBounds?.y ?? workY, workY + screenHeight - winHeight))

  mainWindow = new BrowserWindow({
    show: false,
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    minWidth: 360,
    minHeight: 360,

    alwaysOnTop: true,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const controls = setupWindowControls(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Save bounds on resize/move
  mainWindow.on('resized', () => {
    if (mainWindow && !controls.isCompact() && !mainWindow.isMaximized()) saveBounds(mainWindow.getNormalBounds())
  })
  mainWindow.on('moved', () => {
    if (mainWindow && !controls.isCompact() && !mainWindow.isMaximized()) saveBounds(mainWindow.getNormalBounds())
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  if (!primaryInstance) return
  createWindow()
  setupIPC(mainWindow!)
  startWatcher(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopWatcher()
  app.quit()
})
