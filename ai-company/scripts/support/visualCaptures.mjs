import fs from 'node:fs/promises'
import path from 'node:path'

const captureName = /^capture-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/

export async function createCaptureDirectory(visualsRoot) {
  await fs.mkdir(visualsRoot, { recursive: true })
  let timestamp = Date.now()
  while (true) {
    const output = path.join(visualsRoot, `capture-${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}`)
    try {
      await fs.mkdir(output)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      timestamp += 1
      continue
    }
    await Promise.all(['customer', 'employee'].map((viewpoint) => fs.mkdir(path.join(output, viewpoint))))
    return output
  }
}

export async function retainLatestFiveCaptures(visualsRoot, output, firstImage) {
  if (!firstImage) return []
  const actualRoot = await fs.realpath(visualsRoot)
  const actualOutput = await fs.realpath(output)
  if (actualRoot !== path.resolve(visualsRoot) || actualOutput !== path.resolve(output)
    || path.dirname(actualOutput) !== actualRoot || !captureName.test(path.basename(actualOutput))) {
    throw new Error('Unsafe capture retention root or current directory')
  }
  const actualImage = await fs.realpath(firstImage)
  if (path.dirname(path.dirname(actualImage)) !== actualOutput
    || !['customer', 'employee'].includes(path.basename(path.dirname(actualImage)))) {
    throw new Error('Capture retention requires an image from the current run')
  }
  const image = await fs.stat(actualImage)
  if (!image.isFile() || !image.size) return []
  const runs = (await fs.readdir(actualRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && captureName.test(entry.name))
    .map((entry) => entry.name).sort().reverse()
  const keep = new Set([path.basename(actualOutput), ...runs.filter((name) => name !== path.basename(actualOutput)).slice(0, 4)])
  const removed = []
  for (const name of runs.filter((name) => !keep.has(name))) {
    const target = path.resolve(actualRoot, name)
    const actualTarget = await fs.realpath(target)
    const targetInfo = await fs.lstat(target)
    if (targetInfo.isSymbolicLink() || actualTarget !== target || path.dirname(actualTarget) !== actualRoot
      || actualTarget === actualOutput) throw new Error('Unsafe capture retention target')
    await fs.rm(actualTarget, { recursive: true })
    removed.push(name)
  }
  return removed
}
