import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { planSetup, prepareEnvironment } from '../setup.mjs'
import { packageRelease } from '../../../bin/package-release.mjs'

const releaseDir = path.resolve('release directory')
const envFile = path.resolve('private/runtime.env')
const common = ['--release-dir', releaseDir, '--env-file', envFile]

async function withFixture(work) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agency-server-setup-'))
  try { await work(directory) } finally { await fs.rm(directory, { recursive: true, force: true }) }
}

test('init requires acknowledgement and delegates only the supported native first-time sequence', () => {
  assert.throws(() => planSetup(['init', ...common, '--organization', 'Our Agency']), /confirm-empty-db/)
  const plan = planSetup(['init', ...common, '--organization', 'Our Agency', '--confirm-empty-db'])
  assert.deepEqual(plan.steps, [
    ['preflight', '--env-file', envFile, '--for', 'init'],
    ['up', '--env-file', envFile, '--service', 'postgres'],
    ['init', '--env-file', envFile, '--organization', 'Our Agency'],
  ])
  assert.ok(!plan.steps.flat().some(value => ['reinstall', 'migrate', 'down', '-v'].includes(value)))
})

test('all everyday actions stay separate from initialization and accept an older extracted release', () => {
  assert.deepEqual(planSetup(['start', ...common]).steps, [['up', '--env-file', envFile]])
  for (const action of ['status', 'logs', 'stop']) assert.deepEqual(planSetup([action, ...common]).steps, [[action, '--env-file', envFile]])
  assert.deepEqual(planSetup(['check', ...common]).steps, [['preflight', '--env-file', envFile, '--for', 'up']])
  const image = path.join(releaseDir, 'image/agency-app-1209dbd26.tar')
  assert.deepEqual(planSetup(['import', '--release-dir', releaseDir, '--image-file', image]).steps, [['import', '--file', image]])
  assert.throws(() => planSetup(['start', '--release-dir', 'relative', '--env-file', envFile]), /absolute path/)
  assert.throws(() => planSetup(['stop', ...common, '--reset']), /Invalid options/)
  assert.throws(() => planSetup(['check', ...common, '--for', 'migrate']), /must be up or init/)
  assert.deepEqual(planSetup(['--help']), { help: true })
})

test('prepare pins only image in a private new file and cannot overwrite config', async () => withFixture(async directory => {
  const root = path.join(directory, 'release')
  await fs.mkdir(path.join(root, 'ai-company/docker/agency'), { recursive: true })
  const template = 'AGENCY_IMAGE=replace\nPOSTGRES_PASSWORD=\nOM_DISABLE_EMAIL_DELIVERY=true\n'
  await fs.writeFile(path.join(root, 'ai-company/docker/agency/runtime.env.example'), template)
  const target = path.join(directory, 'runtime.env')
  const plan = planSetup(['prepare', '--release-dir', root, '--env-file', target, '--image', 'agency-app:1209dbd26'])
  await prepareEnvironment(plan)
  assert.equal(await fs.readFile(target, 'utf8'), template.replace('replace', 'agency-app:1209dbd26'))
  if (process.platform !== 'win32') assert.equal((await fs.stat(target)).mode & 0o777, 0o600)
  await assert.rejects(prepareEnvironment(plan), { code: 'EEXIST' })
  assert.equal(await fs.readFile(target, 'utf8'), template.replace('replace', 'agency-app:1209dbd26'))
  await assert.rejects(prepareEnvironment({ ...plan, envFile: path.join(root, 'private.env') }), /outside/)
}))

test('future bundle includes self-contained setup helpers and correct password guidance', async () => withFixture(async directory => {
  const imageFile = path.join(directory, 'fixture-image.tar')
  const output = path.join(directory, 'release.tar')
  await fs.writeFile(imageFile, 'dummy image for offline packaging test')
  await packageRelease({ image: 'agency:test-setup', imageFile, output })
  const archive = await fs.readFile(output)
  const entries = new Map()
  for (let offset = 0; offset < archive.length && archive[offset] !== 0;) {
    const name = archive.subarray(offset, offset + 100).toString().split('\0')[0]
    const size = parseInt(archive.subarray(offset + 124, offset + 136).toString().replace(/\0/g, '').trim(), 8) || 0
    entries.set(name, archive.subarray(offset + 512, offset + 512 + size).toString())
    offset += 512 + Math.ceil(size / 512) * 512
  }
  for (const name of ['guide.md', 'setup.mjs', 'setup.ps1', 'setup.sh']) assert.ok(entries.has(`agency-release-test-setup/.demo-docs/server-setup/${name}`))
  const quickstart = entries.get('agency-release-test-setup/QUICKSTART.txt')
  assert.match(quickstart, /three independent account passwords/)
  assert.doesNotMatch(quickstart, /four independent account passwords/)
  assert.match(quickstart, /setup.sh prepare/)
  await assert.rejects(packageRelease({ image: 'agency:test-setup', imageFile, output }), /already exists/)
}))
