import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createCaptureDirectory, retainLatestFiveCaptures } from '../support/visualCaptures.mjs'

async function fixture(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'agency-visual-retention-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, '.visuals')
  await fs.mkdir(root)
  const names = Array.from({ length: 6 }, (_, index) => `capture-2026-09-19T10-00-0${index}-000Z`)
  await Promise.all(names.map((name) => fs.mkdir(path.join(root, name))))
  return { directory, root, names }
}

async function imageIn(output) {
  await fs.mkdir(path.join(output, 'customer'), { recursive: true })
  const image = path.join(output, 'customer', 'checkpoint.png')
  await fs.writeFile(image, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return image
}

test('retains the current capture and four newest previous captures, leaving unrelated files alone', async (context) => {
  const { root, names } = await fixture(context)
  await fs.mkdir(path.join(root, 'manual-notes'))
  await fs.writeFile(path.join(root, 'capture-not-a-run.json'), '{}')
  const current = await createCaptureDirectory(root)
  assert.deepEqual((await fs.readdir(current)).sort(), ['customer', 'employee'])
  assert.deepEqual(await retainLatestFiveCaptures(root, current, await imageIn(current)), [names[1], names[0]])
  assert.deepEqual((await fs.readdir(root)).sort(), [
    ...names.slice(2), path.basename(current), 'capture-not-a-run.json', 'manual-notes',
  ].sort())
})

test('a run without a saved image never prunes existing captures', async (context) => {
  const { root, names } = await fixture(context)
  const current = await createCaptureDirectory(root)
  assert.deepEqual(await retainLatestFiveCaptures(root, current), [])
  const image = await imageIn(current)
  await fs.truncate(image, 0)
  assert.deepEqual(await retainLatestFiveCaptures(root, current, image), [])
  assert.equal((await fs.readdir(root)).length, names.length + 1)
})

test('retention ignores directory symlinks and preserves their target', async (context) => {
  const { directory, root } = await fixture(context)
  const external = path.join(directory, 'outside')
  await fs.mkdir(external)
  await fs.writeFile(path.join(external, 'keep.txt'), 'keep')
  const link = path.join(root, 'capture-2020-01-01T00-00-00-000Z')
  await fs.symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir')
  const current = await createCaptureDirectory(root)
  await retainLatestFiveCaptures(root, current, await imageIn(current))
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true)
  assert.equal(await fs.readFile(path.join(external, 'keep.txt'), 'utf8'), 'keep')
})

test('retention rejects an external current directory or image before deleting anything', async (context) => {
  const { directory, root, names } = await fixture(context)
  const external = await createCaptureDirectory(path.join(directory, 'outside'))
  const externalImage = await imageIn(external)
  await assert.rejects(retainLatestFiveCaptures(root, external, externalImage), /Unsafe capture retention/)
  const current = await createCaptureDirectory(root)
  await assert.rejects(retainLatestFiveCaptures(root, current, externalImage), /requires an image from the current run/)
  assert.equal((await fs.readdir(root)).length, names.length + 1)
})
