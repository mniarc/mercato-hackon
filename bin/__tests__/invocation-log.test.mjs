import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { createInvocationLog, loggedAgencyCommands, redactCommandArgs } from '../invocation-log.mjs'
import { executeAgencySteps } from '../agency.mjs'
import { packageRelease } from '../package-release.mjs'

async function withDirectory(work) {
  const prefix = path.join(os.tmpdir(), 'agency-log-test-')
  const directory = await fs.mkdtemp(prefix)
  try { return await work(directory) }
  finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(prefix)))
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('logging is limited to build/image transfer commands and redacts obvious secret arguments', () => {
  assert.deepEqual([...loggedAgencyCommands], ['build', 'verify-image', 'export', 'import'])
  for (const command of ['init', 'preflight', 'config-check', 'logs', 'up', 'migrate']) assert.equal(loggedAgencyCommands.has(command), false)
  assert.deepEqual(redactCommandArgs(['--token', 'private-one', '--build-arg', 'API_KEY=private-two', '--password=private-three', 'https://user:private-four@host/path']),
    ['--token', '[redacted]', '--build-arg', 'API_KEY=[redacted]', '--password=[redacted]', 'https://[redacted]@host/path'])
})

test('streams both channels live and retains lifecycle/error status without leaking known secret output', async () => withDirectory(async directory => {
  const log = createInvocationLog(directory, 'build', ['--image', 'test:local'])
  const stdout = new PassThrough(), stderr = new PassThrough()
  let live = ''
  stdout.on('data', chunk => { live += chunk })
  stderr.on('data', chunk => { live += chunk })
  const initialInterruptListeners = process.listenerCount('SIGINT')
  let failure
  try {
    await executeAgencySteps([{ executable: process.execPath, args: ['-e', "console.log('stdout '+process.env.PRIVATE_API_KEY); console.error('stderr useful failure'); process.exitCode=7"], cwd: directory }],
      { PRIVATE_API_KEY: 'private-output-value' }, { log, stdout, stderr })
  } catch (error) { failure = error }
  assert.equal(failure.exitCode, 7)
  log.close({ exitCode: failure.exitCode, signal: failure.signal })
  assert.equal(process.listenerCount('SIGINT'), initialInterruptListeners)
  assert.match(live, /stdout \[redacted\]/)
  assert.match(live, /stderr useful failure/)
  const content = await fs.readFile(log.path, 'utf8')
  assert.match(content, /\[stdout\] stdout \[redacted\]/)
  assert.match(content, /\[stderr\] stderr useful failure/)
  assert.match(content, /"event":"stage_start"/)
  assert.match(content, /"event":"stage_end","stage":1,"exitCode":7/)
  assert.match(content, /"event":"end","command":"build","exitCode":7/)
  assert.equal(content.includes('private-output-value'), false)
}))

test('each invocation owns a separate retained file including a successful run', async () => withDirectory(async directory => {
  const first = createInvocationLog(directory, 'verify-image')
  const second = createInvocationLog(directory, 'verify-image')
  assert.notEqual(first.path, second.path)
  const sink = new PassThrough()
  sink.resume()
  await executeAgencySteps([{ executable: process.execPath, args: ['-e', "console.log('offline success')"], cwd: directory }], {}, { log: first, stdout: sink, stderr: sink })
  first.close()
  second.close({ exitCode: 1 })
  assert.match(await fs.readFile(first.path, 'utf8'), /"event":"end","command":"verify-image","exitCode":0/)
  assert.match(await fs.readFile(second.path, 'utf8'), /"exitCode":1/)
}))

test('portable release retains its logging dependency and reports stages without running Docker', async () => withDirectory(async directory => {
  const imageFile = path.join(directory, 'image.tar'), output = path.join(directory, 'release.tar')
  await fs.writeFile(imageFile, Buffer.from('fixture-image-only'))
  const stages = []
  await packageRelease({ image: 'agency:test-logs', imageFile, output, onProgress: value => stages.push(value) })
  const archive = await fs.readFile(output)
  const names = []
  for (let offset = 0; offset < archive.length && archive[offset] !== 0;) {
    names.push(archive.subarray(offset, offset + 100).toString().split('\0')[0])
    const size = parseInt(archive.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, ''), 8)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  assert.ok(names.includes('agency-release-test-logs/bin/invocation-log.mjs'))
  assert.ok(names.includes('agency-release-test-logs/bin/agency.mjs'))
  assert.deepEqual(stages.map(item => `${item.stage}:${item.status}`), [
    'validate-inputs:start', 'validate-inputs:end', 'deployment-files:start', 'deployment-files:end',
    'image-archive:start', 'image-archive:end', 'seal-release:start', 'seal-release:end',
  ])
  await assert.rejects(packageRelease({ image: 'agency:test-logs', imageFile, output }), /already exists/)
}))
