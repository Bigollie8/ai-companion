// One-time migration helper, executed with the OLD Electron executable before
// npm ci removes Electron. Not part of the Rust application or its dependencies.
// Close the old dashboard first, then:
// .\node_modules\electron\dist\electron.exe scripts\export-electron-preferences.cjs
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')
const { writeFileSync, existsSync, mkdirSync } = require('node:fs')
const directory = join(app.getPath('appData'), 'ai-companion')
const destination = join(directory, 'renderer-preferences.json')
app.setPath('userData', directory)
app.setPath('sessionData', directory)
app.whenReady().then(async () => {
  if (existsSync(destination)) { app.quit(); return }
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  // Chromium localStorage for the old app used the file:// origin.
  await window.loadFile(join(__dirname, 'migration.html'))
  const values = await window.webContents.executeJavaScript(
    'Object.fromEntries(["dashboard.hiddenProjects", "mini-alerts"].map(k => [k, localStorage.getItem(k)]).filter(([,v]) => v !== null))'
  )
  mkdirSync(directory, { recursive: true })
  writeFileSync(destination, JSON.stringify(values))
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
