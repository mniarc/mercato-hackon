import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_BUILD_HEAP_MB = 8192
const maxOldSpaceSize = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=\S+)?(?=\s|$)/

export function resolveBuildNodeOptions(value = '') {
  if (maxOldSpaceSize.test(value)) return value
  const current = value.trim()
  return [current, `--max-old-space-size=${DEFAULT_BUILD_HEAP_MB}`].filter(Boolean).join(' ')
}

function resolveNextCli() {
  const require = createRequire(import.meta.url)
  return path.join(path.dirname(require.resolve('next/package.json')), 'dist', 'bin', 'next')
}

export function runNextBuild({
  argv = process.argv.slice(2),
  env = process.env,
  nextCli = resolveNextCli(),
  spawn = spawnSync,
} = {}) {
  const result = spawn(process.execPath, [nextCli, 'build', ...argv], {
    env: { ...env, NODE_OPTIONS: resolveBuildNodeOptions(env.NODE_OPTIONS) },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runNextBuild()
}
