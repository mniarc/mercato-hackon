/**
 * Minimal Apify REST client: start an actor run, wait for it, page its default
 * dataset. Scraping is an INGESTION step run by the pipeline in code — never a
 * tool an agent calls — so agents stay read-only and egress-free.
 */

export type ApifyClientOptions = {
  token: string
  baseUrl?: string
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  runTimeoutMs?: number
  log?: (message: string) => void
}

export type ApifyRunInfo = {
  id: string
  status: string
  defaultDatasetId: string
}

const TERMINAL_OK = new Set(['SUCCEEDED'])
const TERMINAL_FAIL = new Set(['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMING-OUT', 'ABORTING'])

function actorPath(actorId: string): string {
  return actorId.includes('/') ? actorId.replace('/', '~') : actorId
}

export class ApifyError extends Error {
  constructor(message: string, readonly status?: number) {
    super(`[internal] apify: ${message}`)
  }
}

export function createApifyClient(opts: ApifyClientOptions) {
  const baseUrl = (opts.baseUrl ?? 'https://api.apify.com').replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollIntervalMs = opts.pollIntervalMs ?? 5_000
  const runTimeoutMs = opts.runTimeoutMs ?? 30 * 60_000
  const log = opts.log ?? (() => {})

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(opts.token)}`
    const response = await fetchImpl(url, init)
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ApifyError(`${init?.method ?? 'GET'} ${path} → ${response.status} ${body.slice(0, 300)}`, response.status)
    }
    return (await response.json()) as T
  }

  async function startRun(actorId: string, input: Record<string, unknown>): Promise<ApifyRunInfo> {
    const result = await request<{ data: ApifyRunInfo }>(`/v2/acts/${actorPath(actorId)}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    log(`run ${result.data.id} started for ${actorId}`)
    return result.data
  }

  async function waitForRun(runId: string): Promise<ApifyRunInfo> {
    const deadline = Date.now() + runTimeoutMs
    for (;;) {
      const result = await request<{ data: ApifyRunInfo }>(`/v2/actor-runs/${runId}`)
      const status = result.data.status
      if (TERMINAL_OK.has(status)) return result.data
      if (TERMINAL_FAIL.has(status)) throw new ApifyError(`run ${runId} ended with status ${status}`)
      if (Date.now() > deadline) throw new ApifyError(`run ${runId} still ${status} after ${runTimeoutMs} ms`)
      log(`run ${runId} is ${status}, waiting`)
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  async function datasetItems(datasetId: string, opts2: { pageSize?: number; maxItems?: number } = {}): Promise<unknown[]> {
    const pageSize = opts2.pageSize ?? 1000
    const items: unknown[] = []
    for (let offset = 0; ; offset += pageSize) {
      const page = await request<unknown[]>(
        `/v2/datasets/${datasetId}/items?format=json&clean=true&offset=${offset}&limit=${pageSize}`,
      )
      items.push(...page)
      if (page.length < pageSize || (opts2.maxItems != null && items.length >= opts2.maxItems)) break
    }
    return opts2.maxItems != null ? items.slice(0, opts2.maxItems) : items
  }

  async function runActorAndCollect(actorId: string, input: Record<string, unknown>, maxItems?: number): Promise<unknown[]> {
    const started = await startRun(actorId, input)
    const finished = await waitForRun(started.id)
    const items = await datasetItems(finished.defaultDatasetId, { maxItems })
    log(`run ${finished.id} produced ${items.length} items`)
    return items
  }

  return { startRun, waitForRun, datasetItems, runActorAndCollect }
}

export type ApifyClient = ReturnType<typeof createApifyClient>
