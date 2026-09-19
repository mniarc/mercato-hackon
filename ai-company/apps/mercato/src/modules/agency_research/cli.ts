import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { ensureAgentsLoaded } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { orderDataSchema, orderFactsOf } from './data/schemas/zamowienie'
import { outputIdByTemplate, type TemplateId } from './data/schemas/envelope'
import { limits } from './data/templates'
import { createDirectRunner } from './lib/directRunner'
import { defaultModels, profileScraperFrom, runResearch } from './lib/researchService'
import type { KnownPerson } from './lib/research/steps/people'
import type { FetchPage, SocialPost } from './lib/research/fetch'
import { createFirecrawlFetcher, createFirecrawlSearch, type SearchHit, type SearchWeb } from './lib/research/firecrawl'
import { formatLedger } from './lib/research/ledger'
import type { ResearchAgentRunner } from './lib/research/pipeline'
import { createFixtureRunner, createOrchestratorRunner } from './lib/runners'
import { fileCache } from './lib/research/fileCache'
import { currentInputVersion, orderStatus, type ResearchScope } from './lib/store'
import { AgencyResearchDocumentVersion } from './data/entities'
import { researchSteps, type ResearchStep } from './lib/contracts'

/** `--key value` pairs; a `--flag` followed by another option or nothing is `'true'`. */
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg?.startsWith('-')) continue
    const key = arg.replace(/^-+/, '')
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      result[key] = 'true'
    } else {
      result[key] = next
      i += 1
    }
  }
  return result
}

/**
 * Pages read once for an order are read again from disk: the same bytes keep the
 * same source ids, facts and every downstream cache key, so a rerun replays instead
 * of regenerating because a site changed a footer. `--refetch` reads the web again;
 * an unavailable page is never cached.
 */
function cachedFetcher(inner: FetchPage, dir: string, refetch: boolean): FetchPage {
  fs.mkdirSync(dir, { recursive: true })
  const fileFor = (url: string) => path.join(dir, `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`)
  return async (url) => {
    const file = fileFor(url)
    if (!refetch && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as Awaited<ReturnType<FetchPage>>
    const page = await inner(url)
    if (page.status === 'ok') fs.writeFileSync(file, JSON.stringify(page, null, 2))
    return page
  }
}

type Db = { resolve: (key: string) => unknown; hasRegistration?: (key: string) => boolean; em: EntityManager }

async function connectDb(): Promise<Db> {
  const container = await createRequestContainer()
  return { resolve: container.resolve, hasRegistration: container.hasRegistration?.bind(container), em: (container.resolve('em') as EntityManager).fork() }
}

/** `--people "Name, role, https://…; Name2, role2"` → the people 3.2a follows besides those the pages name. */
function parsePeople(value: string): KnownPerson[] {
  return value.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const urls = [...entry.matchAll(/https?:\/\/\S+/g)].map((match) => match[0])
    const [name, ...rest] = entry.replace(/https?:\/\/\S+/g, '').split(',').map((part) => part.trim()).filter(Boolean)
    return { name, role: rest[0] ?? null, provided_by: 'client' as const, knownUrls: urls }
  }).filter((person) => person.name)
}

/** `--tenant`/`--org`, else the oldest organisation — a CLI has no session to take them from. */
async function resolveScope(db: Db, args: Record<string, string>): Promise<ResearchScope> {
  let tenantId: string = args.tenant ?? ''
  let organizationId: string = args.org ?? ''
  if (!tenantId || !organizationId) {
    const rows = await db.em.getConnection().execute(`select id, tenant_id from organizations where deleted_at is null order by created_at asc limit 1`)
    const first = Array.isArray(rows) ? rows[0] : null
    if (!first) throw new Error('[internal] no organization found — pass --tenant and --org')
    organizationId = organizationId || String(first.id)
    tenantId = tenantId || String(first.tenant_id)
  }
  return { tenantId, organizationId }
}

async function resolveUser(db: Db, scope: ResearchScope, args: Record<string, string>): Promise<string> {
  if (args.user) return args.user
  const rows = await db.em.getConnection().execute(`select id from users where tenant_id = ? and deleted_at is null order by created_at asc limit 1`, [scope.tenantId])
  const id = Array.isArray(rows) && rows[0] ? String(rows[0].id) : ''
  if (!id) throw new Error('[internal] no user found in tenant — pass --user')
  return id
}

/** A file-backed fetcher for demos without network: `<dir>/manifest.json` maps url → {file, access, title}. */
function fileFetcher(dir: string): FetchPage {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, { file?: string; access: string; title?: string; error?: string }>
  return async (url) => {
    const entry = manifest[url] ?? manifest[url.replace(/\/$/, '')]
    if (!entry || entry.access === 'unavailable' || !entry.file) return { url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: entry?.error ?? 'not in fixture manifest' }
    return { url, finalUrl: url, status: 'ok', title: entry.title ?? null, markdown: fs.readFileSync(path.join(dir, entry.file), 'utf8'), error: null }
  }
}

/** Fixture search: `<file>` maps a query (or `*`) to hits. */
function fileSearch(file: string): SearchWeb {
  const table = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, SearchHit[]>
  return async (query) => table[query] ?? table['*'] ?? []
}

function loadSocialCorpus(file: string): SocialPost[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { posts?: SocialPost[] } | SocialPost[]
  const posts = Array.isArray(raw) ? raw : (raw.posts ?? [])
  return posts.map((post) => ({ id: post.id, url: post.url, text: post.text, postedAt: post.postedAt, authorName: post.authorName, likes: post.likes ?? 0, comments: post.comments ?? 0, shares: post.shares ?? 0 }))
}

/**
 * Runs the audit process for one order and stores every document version.
 *
 *   yarn mercato agency_research run --order <zamowienie.json> --order-ref <ref> --out output/research/<slug> \
 *     [--through 3.2|3.5|3.8|4.2] [--social-corpus corpus.json] [--pages url,url] [--fixture-pages <dir>] [--fixture-search <file>] \
 *     [--people "Name, role, https://…; Name2"] \
 *     [--runner orchestrator|direct|fixture] [--fixture <dir>] [--max-cost-pln 20] [--dry-run] [--yes] [--refetch] \
 *     [--tenant <id> --org <id> --user <id>]
 *
 * The orchestrator runner is the default (persisted `agent_runs`, admission,
 * guardrails, cockpit). Spend: every call is checked against the cap before it is
 * made; an estimate above the confirmation threshold needs `--yes`.
 */
const run: ModuleCli = {
  command: 'run',
  async run(rest: string[]) {
    const args = parseArgs(rest ?? [])
    if (!args.order || !args.out) throw new Error('[internal] --order <zamowienie.json> and --out <dir> are required')
    const raw = JSON.parse(fs.readFileSync(args.order, 'utf8')) as { data?: unknown }
    const order = orderDataSchema.parse(raw.data ?? raw)
    const facts = orderFactsOf(order)
    const orderRef = args['order-ref'] ?? `cli-${facts.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const out = args.out
    fs.mkdirSync(out, { recursive: true })
    const maxCostPln = args['max-cost-pln'] ? Number(args['max-cost-pln']) : limits.cost.defaultMaxPlnPerRun
    const through = (args.through ?? '3.2') as ResearchStep
    if (!researchSteps.includes(through)) throw new Error(`[internal] --through must be one of ${researchSteps.join(', ')}`)
    const models = defaultModels()
    const runnerName = args.runner ?? 'orchestrator'

    const db = await connectDb()
    const scope = await resolveScope(db, args)
    const agentRunIds: string[] = []
    let runAgent: ResearchAgentRunner
    if (runnerName === 'fixture') {
      if (!args.fixture) throw new Error('[internal] --runner fixture needs --fixture <dir> with canned agent outputs')
      runAgent = createFixtureRunner(args.fixture)
    } else if (runnerName === 'direct') {
      await ensureAgentsLoaded()
      runAgent = createDirectRunner({ models, outDir: out })
    } else {
      const userId = await resolveUser(db, scope, args)
      runAgent = createOrchestratorRunner(db, { ...scope, userId }, agentRunIds)
    }
    const firecrawlKey = process.env.FIRECRAWL_API_KEY ?? ''
    const fetchPage: FetchPage = args['fixture-pages'] ? fileFetcher(args['fixture-pages']) : cachedFetcher(createFirecrawlFetcher({ apiKey: firecrawlKey }), path.join(out, 'cache', 'pages'), args['refetch'] === 'true')
    const searchWeb: SearchWeb | undefined = args['fixture-search'] ? fileSearch(args['fixture-search']) : firecrawlKey ? createFirecrawlSearch({ apiKey: firecrawlKey }) : undefined
    const socialPosts = args['social-corpus'] ? loadSocialCorpus(args['social-corpus']) : undefined
    console.log(`Runner: ${runnerName} (extract ${models.extract}, synthesis ${models.synthesis}) · cap ${maxCostPln} PLN · tenant=${scope.tenantId} org=${scope.organizationId} order=${orderRef}`)

    const events: unknown[] = []
    let confirmed = args.yes === 'true'
    const outcome = await runResearch({
      em: db.em,
      scope,
      orderRef,
      order,
      runAgent,
      runner: runnerName,
      models,
      fetchPage,
      searchWeb,
      socialPosts,
      pages: args.pages ? args.pages.split(',').map((url) => url.trim()).filter(Boolean) : undefined,
      knownPeople: args.people ? parsePeople(args.people) : undefined,
      scrapeProfilePosts: runnerName === 'fixture' ? undefined : profileScraperFrom(db),
      through,
      selectedTopicId: args.topic ?? null,
      freshSelection: args.refetch === 'true',
      maxCostPln,
      cache: fileCache(path.join(out, 'cache')),
      concurrency: args.concurrency ? Number(args.concurrency) : undefined,
      agentRunIds,
      log: (message) => console.log(`  fetch ${message}`),
      onEvent: (event) => {
        events.push(event)
        if (event.type === 'plan') {
          console.log(`Plan: ${event.pages} pages, ${event.chunks} chunks — estimated ${event.estimatedPln.toFixed(2)} PLN (cap ${maxCostPln})`)
          if (args['dry-run'] === 'true') throw new Error('[internal] dry run: stopped before the first agent call')
          if (event.estimatedPln > limits.cost.confirmAbovePln && !confirmed && runnerName !== 'fixture') {
            throw new Error(`[internal] estimated ${event.estimatedPln.toFixed(2)} PLN exceeds ${limits.cost.confirmAbovePln} PLN — rerun with --yes to confirm the spend`)
          }
          confirmed = true
        }
        if (event.type === 'call') console.log(`  ${event.step} ${event.label} ${event.cached ? '(cached)' : `${event.ms} ms, ${event.costPln.toFixed(3)} PLN`}`)
        if (event.type === 'gate' && event.dropped > 0) console.log(`  gate ${event.section}: kept ${event.kept}, dropped ${event.dropped} (${[...new Set(event.issues.map((i) => i.code))].join(', ')})`)
        if (event.type === 'technical_retry') console.warn(`  ${event.step} ${event.label}: provider error (${event.error}) — retry ${event.attempt}`)
        if (event.type === 'gate_rejected') console.warn(`  gate REJECTED ${event.section} (attempt ${event.attempt}) — re-requesting`)
        if (event.type === 'budget_warning') console.warn(`  budget: ${event.total.toFixed(2)} PLN spent (warning at ${event.warnAt})`)
        if (event.type === 'budget_paused') console.error(`  budget PAUSED at ${event.total.toFixed(2)} PLN (cap ${event.cap})`)
      },
    }).catch((error) => {
      fs.writeFileSync(path.join(out, `events.${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(events, null, 2))
      throw error
    })

    const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.writeFileSync(path.join(out, `events.${runStamp}.json`), JSON.stringify(events, null, 2))
    // Every version of every document goes to files, named by version and never overwritten:
    // envelope + data, the internal markdown, the client view. Older runs' files stay as they were.
    const written = writeDocumentVersions(db.em, scope, orderRef, path.join(out, 'documents'))
    const status = await orderStatus(db.em, scope, orderRef)
    const last = status.taskRuns[status.taskRuns.length - 1]
    if (last?.status === 'paused_budget') console.error(`Paused on budget: ${outcome.spentPln.toFixed(2)} PLN spent; task run ${last.id}`)
    console.log(`Completed through ${outcome.completedThrough ?? '— (not completed)'} · versions ${outcome.documentVersionIds.length} · agent runs ${outcome.agentRunIds.length}${outcome.qaVerdict ? ` · QA ${outcome.qaVerdict}` : ''}${outcome.briefQaVerdict ? ` · brief QA ${outcome.briefQaVerdict}` : ''}${outcome.strategyQaVerdict ? ` · Q-S ${outcome.strategyQaVerdict}` : ''}${outcome.planQaVerdict ? ` · Q-P ${outcome.planQaVerdict}` : ''}${outcome.postQaVerdict ? ` · Q-T ${outcome.postQaVerdict}` : ''}${outcome.closeAllowed !== undefined ? ` · close_allowed ${outcome.closeAllowed}` : ''}${outcome.escalationVersionId ? ` · E.1 opened (${outcome.escalationVersionId})` : ''}`)
    console.log(`Spend this run: ${outcome.spentPln.toFixed(2)} PLN · order total ${status.totalPln.toFixed(2)} PLN`)
    console.log(`Written ${await written} new version files to ${path.resolve(path.join(out, 'documents'))}`)
  },
}

/** Writes every stored version as `<OUTPUT>.v<N>.{json,md,client.md}`; existing files are never touched. */
async function writeDocumentVersions(em: Awaited<ReturnType<typeof connectDb>>['em'], scope: { tenantId: string; organizationId: string }, orderRef: string, dir: string): Promise<number> {
  fs.mkdirSync(dir, { recursive: true })
  const versions = await em.find(AgencyResearchDocumentVersion, { ...scope, orderRef }, { orderBy: { createdAt: 'asc' } })
  let written = 0
  const put = (file: string, content: string) => {
    if (fs.existsSync(file)) return
    fs.writeFileSync(file, content)
    written += 1
  }
  for (const version of versions) {
    const base = path.join(dir, `${outputIdByTemplate[version.templateId as TemplateId]}.v${version.versionNo}`)
    put(`${base}.json`, JSON.stringify({ ...envelopeOf(version), data: version.data }, null, 2))
    put(`${base}.md`, version.renderedMd)
    if (version.clientViewMd) put(`${base}.client.md`, version.clientViewMd)
  }
  return written
}

function envelopeOf(version: AgencyResearchDocumentVersion) {
  return {
    document_id: `${version.templateId}@${version.orderRef}`,
    template_id: version.templateId,
    schema_version: version.schemaVersion,
    order_id: version.orderRef,
    version: `${version.versionNo}.0`,
    status: version.status,
    input_versions: version.inputVersions,
    field_evidence: version.fieldEvidence,
    approval_records: version.approvalRecords,
    simulation_flag: version.simulationFlag,
    issues: version.issues,
  }
}

/** yarn mercato agency_research status --order-ref <ref> [--tenant --org] */
const status: ModuleCli = {
  command: 'status',
  async run(rest: string[]) {
    const args = parseArgs(rest ?? [])
    if (!args['order-ref']) throw new Error('[internal] --order-ref is required')
    const db = await connectDb()
    const scope = await resolveScope(db, args)
    const status = await orderStatus(db.em, scope, args['order-ref'])
    console.log(`Order ${args['order-ref']}: ${status.documents.length} documents, ${status.sources} sources, ${status.taskRuns.length} task runs, ${status.totalPln.toFixed(2)} PLN spent`)
    for (const d of status.documents) console.log(`  ${d.outputId} v${d.versionNo ?? '-'} ${d.status} (${d.versionId ?? 'no version'})`)
    for (const r of status.taskRuns) console.log(`  ${r.stepId} #${r.attempt} ${r.status} · ${r.runner} · ${r.costPln.toFixed(2)} PLN · ${r.agentRuns} agent runs${r.error ? ` · ${r.error}` : ''}`)
    const runs = status.taskRuns.filter((r) => r.costPln > 0)
    if (runs.length) {
      const snapshot = (await db.em.getConnection().execute(`select cost from agency_research_task_runs where id = ?`, [runs[runs.length - 1].id])) as { cost: unknown }[]
      const cost = snapshot[0]?.cost as Parameters<typeof formatLedger>[0] | null
      if (cost) console.log(formatLedger(cost))
    }
  },
}

/** yarn mercato agency_research escalations --order-ref <ref> — the E.1 records of an order. */
const escalations: ModuleCli = {
  command: 'escalations',
  async run(rest: string[]) {
    const args = parseArgs(rest ?? [])
    if (!args['order-ref']) throw new Error('[internal] --order-ref is required')
    const db = await connectDb()
    const scope = await resolveScope(db, args)
    const status = await orderStatus(db.em, scope, args['order-ref'])
    const runs = status.taskRuns.filter((r) => r.stepId === 'E.1')
    console.log(`Order ${args['order-ref']}: ${runs.length} escalation(s)`)
    for (const r of runs) console.log(`  ${r.createdAt.toISOString()} ${r.status} run ${r.id}${r.error ? ` · ${r.error}` : ''}`)
    const current = await currentInputVersion(db.em, scope, args['order-ref'], 'WZR-ESKALACJA')
    if (current) {
      const version = await db.em.findOne(AgencyResearchDocumentVersion, { id: current.versionId })
      if (version) console.log(`\n${version.renderedMd}`)
    }
  },
}

const agencyResearchCliCommands: ModuleCli[] = [run, status, escalations]

export default agencyResearchCliCommands
