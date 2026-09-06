const { buildSync } = require('esbuild')
const { spawnSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname, '..')
buildSync({ entryPoints: [path.join(root, 'scripts/smoke-main.ts')], outfile: path.join(root, '.test-out/smoke-main.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
buildSync({ entryPoints: [path.join(root, 'scripts/window-restart.ts')], outfile: path.join(root, '.test-out/window-restart.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
for (const phase of ['save', 'restore', 'unpinned']) {
  const check = spawnSync(require('electron'), [path.join(root, '.test-out/window-restart.cjs'), phase], { stdio: 'inherit', env, timeout: 15000 })
  if (check.status !== 0) process.exit(check.status ?? 1)
}
const result = spawnSync(require('electron'), [path.join(root, '.test-out/smoke-main.cjs'), ...(process.argv.includes('--mini') ? ['--mini'] : [])], { stdio: 'inherit', env, timeout: 60000 })
process.exit(result.status ?? 1)
