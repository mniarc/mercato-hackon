import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.AGENCY_MANUAL_PROFILE !== 'fixture'
    || process.env.AGENCY_TEST_NATIVE_TRIAGE !== '1') throw new Error('Explicit local manual fixture profile required')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const appRoot = path.join(root, 'apps/mercato')
  const runtime = path.resolve(process.env.AGENCY_MANUAL_RUNTIME_DIR ?? path.join(appRoot, '.mercato/agency-manual-fixture'))
  const output = await compileAppSourceFile(path.join(root, 'scripts/support/manualFixture/backend.ts'), {
    appRoot, outFile: path.join(runtime, 'provider.mjs'), format: 'esm',
  })
  const backend = await import(pathToFileURL(output).href) as { startManualFixture(appRoot: string): Promise<{ close(): Promise<void> }> }
  const provider = await backend.startManualFixture(appRoot)
  console.log('[agency-manual-fixture] Ready http://127.0.0.1:5005/v1 — local intelligence only; native auth, workflow, QA and approvals remain real.')
  console.log('[agency-manual-fixture] Brief answers: quote the full invited question in a portal comment, or write its exact question ID followed by ": your answer". Unmatched text never fills a decision.')
  console.log('[agency-manual-fixture] Research uses the existing FLOW corpus. Current post intelligence supports the actual TOP02 selection only; arbitrary private-file meaning and free-form requests are not inferred.')
  process.send?.({ type: 'agency-manual-fixture-ready' })
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    await provider.close()
    process.exit(0)
  }
  process.once('SIGINT', () => { void close() })
  process.once('SIGTERM', () => { void close() })
}

main().catch((error: unknown) => {
  console.error(`[agency-manual-fixture] Startup failed: ${error instanceof Error ? error.name : 'unknown error'}. Check the explicit fixture profile, tenant/org scope and native app setup.`)
  process.exitCode = 1
})
