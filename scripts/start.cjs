const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')
const executable = path.join(__dirname, '..', 'src-tauri', 'target', 'release', process.platform === 'win32' ? 'ai-companion.exe' : 'ai-companion')
if (!existsSync(executable)) {
  console.error('Build the Rust app first with npm run build.')
  process.exit(1)
}
const child = spawn(executable, [], { detached: true, stdio: 'ignore' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.unref()
