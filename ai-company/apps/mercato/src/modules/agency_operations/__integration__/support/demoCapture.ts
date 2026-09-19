import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, TestInfo } from '@playwright/test'
import { createCaptureDirectory, retainLatestFiveCaptures } from '../../../../../../../scripts/support/visualCaptures.mjs'

type Viewpoint = 'customer' | 'employee'
type Capture = { name: string; viewpoint: Viewpoint; file: string; pathname: string; testId: string; retry: number }
type TestResult = { testId: string; title: string; retry: number; status: string; expectedStatus: string }
type CaptureRun = { output: string; startedAt: string; captures: Capture[]; tests: TestResult[] }
const sourceFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url)
const visualsRoot = path.resolve(path.dirname(sourceFile), '../../../../../../../../.visuals')
let run: Promise<CaptureRun> | undefined

async function openRun(info: TestInfo): Promise<CaptureRun> {
  const marker = path.join(info.project.outputDir, '.agency-demo-capture.json')
  try {
    const { output } = JSON.parse(await fs.readFile(marker, 'utf8')) as { output: string }
    if (path.dirname(path.resolve(output)) !== visualsRoot
      || !/^capture-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(path.basename(output))
      || await fs.realpath(output) !== path.resolve(output)) throw new Error('Invalid demo capture directory')
    const previous = JSON.parse(await fs.readFile(path.join(output, 'capture.json'), 'utf8')) as Omit<CaptureRun, 'output'>
    return { output, startedAt: previous.startedAt, captures: previous.captures, tests: previous.tests }
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const current: CaptureRun = { output: await createCaptureDirectory(visualsRoot), startedAt: new Date().toISOString(), captures: [], tests: [] }
  await writeManifest(current)
  await fs.mkdir(info.project.outputDir, { recursive: true })
  await fs.writeFile(marker, JSON.stringify({ output: current.output }))
  return current
}

async function currentRun(info: TestInfo) {
  run ??= openRun(info)
  const current = await run
  let result = current.tests.find((entry) => entry.testId === info.testId && entry.retry === info.retry)
  if (!result) {
    result = { testId: info.testId, title: info.title, retry: info.retry, status: 'incomplete', expectedStatus: info.expectedStatus }
    current.tests.push(result)
  }
  return { current, result }
}

async function writeManifest(current: CaptureRun) {
  const status = current.tests.some((entry) => ['failed', 'timedOut', 'interrupted'].includes(entry.status))
    ? 'failed'
    : !current.tests.length || current.tests.some((entry) => entry.status !== 'passed') ? 'incomplete' : 'completed'
  await fs.writeFile(path.join(current.output, 'capture.json'), JSON.stringify({
    kind: 'demo-checkpoints', startedAt: current.startedAt, updatedAt: new Date().toISOString(), status,
    tests: current.tests, captures: current.captures,
  }, null, 2))
}

export async function captureDemoCheckpoint(page: Page, info: TestInfo, name: string, viewpoint: Viewpoint) {
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const { current } = await currentRun(info)
  await writeManifest(current)
  const filename = `${String(current.captures.length + 1).padStart(2, '0')}-${name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120)}.png`
  const file = path.join(viewpoint, filename)
  const target = path.join(current.output, file)
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' })
  current.captures.push({ name, viewpoint, file: file.replace(/\\/g, '/'), pathname: new URL(page.url()).pathname, testId: info.testId, retry: info.retry })
  await writeManifest(current)
  await info.attach(`${viewpoint}: ${name}`, { path: target, contentType: 'image/png' })
  console.log(`[demo-capture] ${target}`)
}

export async function finishDemoCapture(info: TestInfo) {
  if (process.env.PW_CAPTURE_SCREENSHOTS !== '1') return
  const { current, result } = await currentRun(info)
  result.status = info.status ?? 'incomplete'
  await writeManifest(current)
  await info.attach('demo-capture-manifest', { path: path.join(current.output, 'capture.json'), contentType: 'application/json' })
  await retainLatestFiveCaptures(visualsRoot, current.output, current.captures[0] && path.join(current.output, current.captures[0].file))
  console.log(`[demo-capture] ${result.status}: ${current.output}`)
}
