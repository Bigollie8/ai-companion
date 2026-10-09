const { buildSync } = require('esbuild')
const { spawnSync } = require('child_process')
const path = require('path')
const root = path.resolve(__dirname, '..')
const suites = ['usage', 'limits', 'dial']
buildSync({ entryPoints: suites.map(name => path.join(root, `tests/${name}.test.ts`)), outdir: path.join(root, '.test-out'), outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs' })
const result = spawnSync(process.execPath, ['--test', ...suites.map(name => path.join(root, `.test-out/${name}.test.cjs`))], { stdio: 'inherit' })
process.exit(result.status ?? 1)
