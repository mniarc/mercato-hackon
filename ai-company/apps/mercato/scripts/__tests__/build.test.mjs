import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_BUILD_HEAP_MB, resolveBuildNodeOptions, runNextBuild } from '../build.mjs'

test('adds the proven build heap default without dropping other Node options', () => {
  assert.equal(resolveBuildNodeOptions(), `--max-old-space-size=${DEFAULT_BUILD_HEAP_MB}`)
  assert.equal(resolveBuildNodeOptions('--trace-warnings'), `--trace-warnings --max-old-space-size=${DEFAULT_BUILD_HEAP_MB}`)
})

test('preserves explicit dashed and underscored heap settings', () => {
  assert.equal(resolveBuildNodeOptions('--trace-warnings --max-old-space-size=4096'), '--trace-warnings --max-old-space-size=4096')
  assert.equal(resolveBuildNodeOptions('--max_old_space_size 6144 --trace-warnings'), '--max_old_space_size 6144 --trace-warnings')
})

test('invokes the installed Next CLI without a shell and returns its exit code', () => {
  let invocation
  const status = runNextBuild({ argv: ['--debug'], env: { NODE_OPTIONS: '--trace-warnings' }, nextCli: '/installed/next',
    spawn: (executable, args, options) => { invocation = { executable, args, options }; return { status: 23 } } })
  assert.equal(status, 23)
  assert.equal(invocation.executable, process.execPath)
  assert.deepEqual(invocation.args, ['/installed/next', 'build', '--debug'])
  assert.equal(invocation.options.stdio, 'inherit')
  assert.equal(invocation.options.env.NODE_OPTIONS, `--trace-warnings --max-old-space-size=${DEFAULT_BUILD_HEAP_MB}`)
})
