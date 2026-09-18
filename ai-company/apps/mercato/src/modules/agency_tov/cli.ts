import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAgentEntry } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import type { AgentRuntimeService } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { TOV_BATCH_ANALYST_AGENT_ID, TOV_SOURCE_SCOUT_AGENT_ID } from './ai-agents'
import {
  tovOutputLanguages,
  tovSourceScoutResult,
  tovSources,
  type TovOutputLanguage,
  type TovPost,
  type TovSource,
  type TovSourceScoutInput,
} from './data/validators'
import { groupByProfile, mergeCorpora, type NormalizeResult } from './lib/corpus'
import { createApifyClient } from './lib/corpus/apify'
import { normalizeLinkedInPosts } from './lib/corpus/linkedin'
import { scrapeTargets, tovSourceAdapters, type TovScrapeTarget } from './lib/corpus/sources'
import {
  citationsOf,
  finishResearchRun,
  importCorpus,
  type ImportCorpusInput,
  loadCorpus,
  saveDocumentVersion,
  startResearchRun,
  type StoredCorpus,
  type TovScope,
} from './lib/store'
import { runTovPipeline, type TovAgentRunner, type TovPipelineCache, type TovPipelineResult } from './lib/tov/pipeline'
import { linkResolverFor, renderBrandTov, renderProfileVoice, renderRunSummary } from './lib/tov/render'

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

function slug(value: string): string {
  return value.toLowerCase().replace(/https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function fileCache(dir: string): TovPipelineCache {
  fs.mkdirSync(dir, { recursive: true })
  const fileFor = (key: string) => path.join(dir, `${key.replace(/[^a-z0-9_.-]+/gi, '_')}.json`)
  return {
    async get(key) {
      const file = fileFor(key)
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    },
    async set(key, value) {
      fs.writeFileSync(fileFor(key), JSON.stringify(value, null, 2))
    },
  }
}

function parseTargets(raw: string | undefined): TovScrapeTarget[] {
  if (!raw) return []
  return raw.split(',').map((pair) => {
    const [source, ...rest] = pair.split('=')
    const url = rest.join('=').trim()
    if (!tovSources.includes(source as TovSource) || !url) {
      throw new Error(`[internal] --scrape expects <source>=<url>[,<source>=<url>], sources: ${Object.keys(tovSourceAdapters).join(', ')}; got "${pair}"`)
    }
    return { source: source as TovSource, url }
  })
}

function loadCorpusFile(file: string, source: TovSource): NormalizeResult {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (raw && typeof raw === 'object' && Array.isArray(raw.posts)) return { posts: raw.posts as TovPost[], skipped: [] }
  if (!Array.isArray(raw)) throw new Error(`[internal] ${file}: expected an Apify dataset array or a { posts } corpus`)
  if (source === 'linkedin') return normalizeLinkedInPosts(raw)
  const adapter = (tovSourceAdapters as Partial<Record<TovSource, (typeof tovSourceAdapters)['linkedin']>>)[source]
  if (!adapter) throw new Error(`[internal] no adapter for source "${source}"`)
  return adapter.normalize(raw, [{ source, url: source }])
}

/**
 * Asks the web-enabled scout where the brand's people publish, then keeps the
 * targets a source adapter can ingest. Needs web search enabled for the caller.
 */
async function discoverTargets(
  runAgent: TovAgentRunner,
  input: TovSourceScoutInput,
  minConfidence: number,
): Promise<{ targets: TovScrapeTarget[]; notes: string; dropped: string[] }> {
  const result = tovSourceScoutResult.parse(await runAgent(TOV_SOURCE_SCOUT_AGENT_ID, input, { runTimeoutMs: 5 * 60_000 }))
  const targets: TovScrapeTarget[] = []
  const dropped: string[] = []
  for (const target of result.data.targets) {
    const supported = target.source in tovSourceAdapters
    if (supported && target.confidence >= minConfidence) targets.push({ source: target.source, url: target.url })
    else dropped.push(`${target.source} ${target.url} (${supported ? `confidence ${target.confidence}` : 'no adapter'})`)
  }
  return { targets, notes: result.data.notes, dropped }
}

type Db = { resolve: (key: string) => unknown; em: EntityManager }

async function connectDb(): Promise<Db> {
  const { resolve } = await createRequestContainer()
  return { resolve, em: (resolve('em') as EntityManager).fork() }
}

/** `--tenant`/`--org`, else the oldest organisation — a CLI has no session to take them from. */
async function resolveScope(db: Db, args: Record<string, string>): Promise<TovScope> {
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

/**
 * Runs every agent through the Agent Orchestrator: persisted `agent_runs`, admission
 * gate, provider budget, guardrails and the Backend → Agents cockpit see each call.
 */
async function orchestratorRunner(db: Db, scope: TovScope, args: Record<string, string>): Promise<TovAgentRunner> {
  let userId: string = args.user ?? ''
  if (!userId) {
    const rows = await db.em
      .getConnection()
      .execute(`select id from users where tenant_id = ? and deleted_at is null order by created_at asc limit 1`, [scope.tenantId])
    userId = Array.isArray(rows) && rows[0] ? String(rows[0].id) : ''
    if (!userId) throw new Error('[internal] no user found in tenant — pass --user')
  }
  const agentRuntime = db.resolve('agentRuntime') as AgentRuntimeService
  const ctx = { ...scope, userId }
  console.log(`Runner: agent_orchestrator (tenant=${ctx.tenantId} org=${ctx.organizationId} user=${ctx.userId})`)
  return (agentId, input, opts) => agentRuntime.run(agentId, input, { ...ctx, runTimeoutMs: opts.runTimeoutMs })
}

function directModels(args: Record<string, string>): { analysis: string; synthesis: string } {
  const openrouterKey = process.env.OPENROUTER_API_KEY
  return {
    analysis: args.model ?? process.env.OM_AGENCY_TOV_MODEL ?? (openrouterKey ? 'anthropic/claude-haiku-4.5' : 'gpt-5-mini'),
    synthesis: args['synthesis-model'] ?? process.env.OM_AGENCY_TOV_SYNTHESIS_MODEL ?? (openrouterKey ? 'anthropic/claude-sonnet-5' : 'gpt-5'),
  }
}

/**
 * Prompt iteration without the platform: the same registered instructions and
 * schemas, one bare structured-output call per step. Agent calls are not
 * persisted (`--persist` still stores the corpus, the run and the versions).
 */
function directRunner(args: Record<string, string>): TovAgentRunner {
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openrouterKey && !openaiKey) throw new Error('[internal] --runner direct needs OPENROUTER_API_KEY or OPENAI_API_KEY')
  const provider = openrouterKey
    ? createOpenAI({ apiKey: openrouterKey, baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1' })
    : createOpenAI({ apiKey: openaiKey })
  const { analysis: analysisModel, synthesis: synthesisModel } = directModels(args)
  const modelFor = (agentId: string) => (agentId === TOV_BATCH_ANALYST_AGENT_ID ? analysisModel : synthesisModel)
  console.log(`Runner: direct (${openrouterKey ? 'openrouter' : 'openai'}; analysis ${analysisModel}, synthesis ${synthesisModel})`)
  return async (agentId, input, opts) => {
    const entry = getAgentEntry(agentId)
    if (!entry) throw new Error(`[internal] unknown agent ${agentId}`)
    // Provider-side structured output compiles the schema into a grammar, which
    // Anthropic rejects for the large synthesis schemas ("too large"). The small
    // analyst schema uses it (exact JSON every time); the synthesizers get the
    // schema in the prompt instead and are retried when a small model emits
    // malformed JSON.
    const structured = agentId === TOV_BATCH_ANALYST_AGENT_ID
    const schemaJson = structured ? '' : JSON.stringify(z.toJSONSchema(entry.schema))
    const attempts = 3
    let text = ''
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (structured) {
          const result = await generateText({
            model: provider.chat(modelFor(agentId)),
            system: entry.instructions,
            prompt: JSON.stringify(input),
            output: Output.object({ schema: entry.schema }),
            timeout: opts.runTimeoutMs,
            maxRetries: 2,
          })
          return result.output
        }
        const result = await generateText({
          model: provider.chat(modelFor(agentId)),
          system: `${entry.instructions}

Respond with ONLY one JSON object (no prose, no code fences; escape every double quote inside strings) that validates against this JSON Schema:
${schemaJson}`,
          prompt: JSON.stringify(input),
          timeout: opts.runTimeoutMs,
          maxRetries: 2,
        })
        text = result.text
        const parsed = entry.schema.safeParse(JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')))
        if (!parsed.success) throw new Error(`[internal] ${agentId}: output does not match schema — ${parsed.error.message}`)
        return parsed.data
      } catch (err) {
        lastError = err
        const details = err && typeof err === 'object' ? (err as { responseBody?: unknown; text?: unknown; cause?: { message?: string } }) : {}
        const raw = text || String(details.text ?? details.responseBody ?? '')
        const file = path.join(args.out, `failed-${agentId}-${Date.now()}.txt`)
        fs.writeFileSync(file, `${err instanceof Error ? err.message : String(err)}
${details.cause?.message ?? ''}

${raw}`)
        console.error(`${agentId}: attempt ${attempt}/${attempts} failed — details in ${file}`)
      }
    }
    throw lastError
  }
}

type CollectedInputs = {
  file: NormalizeResult | null
  scraped: { corpus: NormalizeResult; targets: TovScrapeTarget[]; reports: unknown } | null
}

/** Reads `--file` / `--scrape` / `--discover` into normalised corpora, one per origin, with what to record about each. */
async function collectInputs(
  args: Record<string, string>,
  brand: string,
  lang: TovOutputLanguage,
  out: string,
  runAgent: TovAgentRunner,
): Promise<CollectedInputs> {
  let file: NormalizeResult | null = null
  if (args.file) {
    const source = (args.source ?? 'linkedin') as TovSource
    file = loadCorpusFile(args.file, source)
    console.log(`Loaded ${file.posts.length} posts from ${args.file} (${file.skipped.length} skipped)`)
  }
  const targets = parseTargets(args.scrape)
  if (args.discover) {
    const knownUrls = targets.map((target) => target.url)
    const people = args.discover.split(';').map((name) => name.trim()).filter(Boolean).map((name) => ({ name, knownUrls }))
    const discovered = await discoverTargets(
      runAgent,
      { brand, people, websiteUrl: args.website ?? null, outputLanguage: lang },
      Number(args['min-confidence'] ?? 0.6),
    )
    fs.writeFileSync(path.join(out, 'discovery.json'), JSON.stringify(discovered, null, 2))
    console.log(`Scout: ${discovered.targets.length} targets kept, ${discovered.dropped.length} dropped — ${discovered.notes}`)
    for (const target of discovered.targets) if (!knownUrls.includes(target.url)) targets.push(target)
  }
  let scraped: CollectedInputs['scraped'] = null
  if (targets.length > 0) {
    const token = process.env.APIFY_TOKEN
    if (!token) throw new Error('[internal] --scrape needs APIFY_TOKEN')
    const client = createApifyClient({ token, log: (message) => console.log(`apify: ${message}`) })
    const { corpus, reports } = await scrapeTargets(client, targets, {
      maxPostsPerSource: Number(args['max-posts'] ?? 500),
      log: (message) => console.warn(`apify: ${message}`),
    })
    fs.writeFileSync(path.join(out, 'scrape-report.json'), JSON.stringify(reports, null, 2))
    for (const report of reports) {
      console.log(`${report.source}: ${report.posts} posts from ${report.items} items via ${report.actorId}${report.error ? ` — ERROR ${report.error}` : ''}`)
    }
    scraped = { corpus, targets, reports }
  }
  return { file, scraped }
}

/** Stores what came in, then re-reads the corpus from the database so the agents only ever see stored rows. */
async function persistInputs(db: Db, scope: TovScope, brand: string, args: Record<string, string>, inputs: CollectedInputs): Promise<StoredCorpus> {
  const profileUrls = new Set<string>()
  const imports: ImportCorpusInput[] = []
  if (inputs.file) {
    const source = (args.source ?? 'linkedin') as TovSource
    imports.push({ brand, mode: 'file', targets: [{ source, url: args.file }], reports: inputs.file.skipped, corpus: inputs.file })
  }
  if (inputs.scraped) imports.push({ brand, mode: 'apify', targets: inputs.scraped.targets, reports: inputs.scraped.reports, corpus: inputs.scraped.corpus })
  for (const input of imports) {
    const result = await importCorpus(db.em, scope, input)
    for (const url of groupByProfile(input.corpus.posts).keys()) profileUrls.add(url)
    console.log(`Stored ${input.mode} import ${result.run.id}: ${result.added} new posts, ${result.existing} already stored, ${result.sources.length} sources`)
  }
  if (args.profile) {
    profileUrls.clear()
    profileUrls.add(args.profile)
  }
  const corpus = await loadCorpus(db.em, scope, { profileUrls: [...profileUrls] })
  console.log(`Corpus from database: ${corpus.posts.length} posts, ${corpus.sources.length} sources${profileUrls.size ? '' : ' (every stored source)'}`)
  return corpus
}

/** Writes the run's files; every citation links to the post itself. */
function writeOutputs(out: string, result: TovPipelineResult, posts: TovPost[], groundingLog: unknown[]): void {
  const linkOf = linkResolverFor(posts)
  const profilesDir = path.join(out, 'profiles')
  fs.mkdirSync(profilesDir, { recursive: true })
  for (const profile of result.profiles) {
    const base = path.join(profilesDir, slug(profile.profile.profileUrl))
    fs.writeFileSync(`${base}.json`, JSON.stringify(profile, null, 2))
    fs.writeFileSync(`${base}.md`, renderProfileVoice(profile.profile, profile.voice, linkOf))
  }
  fs.writeFileSync(path.join(out, 'brand.json'), JSON.stringify(result.brand, null, 2))
  fs.writeFileSync(path.join(out, 'KLI-TOV.md'), renderBrandTov(result.brand, result.profiles, linkOf))
  fs.writeFileSync(path.join(out, 'grounding-report.json'), JSON.stringify(groundingLog, null, 2))
  fs.writeFileSync(path.join(out, 'run-summary.txt'), renderRunSummary(result))
}

/** One `KLI-TOV` version plus one `TOV-PROFILE` version per author, each with its citations resolved to post rows. */
async function persistOutputs(db: Db, scope: TovScope, brand: string, runId: string, result: TovPipelineResult, corpus: StoredCorpus): Promise<void> {
  const linkOf = linkResolverFor(corpus.posts)
  const byProfile = groupByProfile(corpus.posts)
  for (const profile of result.profiles) {
    const posts = byProfile.get(profile.profile.profileUrl) ?? []
    const { version } = await saveDocumentVersion(db.em, scope, {
      brand,
      kind: 'TOV-PROFILE',
      profileUrl: profile.profile.profileUrl,
      title: `Voice profile — ${profile.profile.displayName}`,
      researchRunId: runId,
      body: profile.voice,
      renderedMd: renderProfileVoice(profile.profile, profile.voice, linkOf),
      citations: citationsOf(profile.voice, posts, corpus.rowOf),
    })
    console.log(`  TOV-PROFILE ${profile.profile.displayName}: version ${version.versionNo} (${version.id})`)
  }
  const { version } = await saveDocumentVersion(db.em, scope, {
    brand,
    kind: 'KLI-TOV',
    profileUrl: '',
    title: `Tone of voice — ${brand}`,
    researchRunId: runId,
    body: result.brand,
    renderedMd: renderBrandTov(result.brand, result.profiles, linkOf),
    citations: citationsOf(result.brand, corpus.posts, corpus.rowOf),
  })
  console.log(`  KLI-TOV: version ${version.versionNo} (${version.id}) — research run ${runId}`)
}

/**
 * Builds the tone-of-voice document for a brand from what its people publish.
 *
 *   yarn mercato agency_tov run --brand "Open Mercato" --out output/tov \
 *     [--file <apify-export.json> [--source linkedin]] \
 *     [--scrape linkedin=https://www.linkedin.com/in/x/,website=https://example.com] \
 *     [--persist] [--profile <url>] \
 *     [--max-posts 500] [--lang en|pl] [--batch-size 40] [--concurrency 4] [--limit N] \
 *     [--runner orchestrator|direct] [--model <analysis id>] [--synthesis-model <id>] [--tenant <id> --org <id> --user <id>]
 *
 * `--file` reads a corpus already scraped (an Apify dataset export, or a
 * `corpus.json` this command wrote); `--scrape` runs Apify live (`APIFY_TOKEN`);
 * `--discover` first asks the web-enabled scout agent where these people publish
 * and scrapes what it finds (plus any `--scrape` targets). All three combine.
 *
 * `--persist` routes everything through the database: inputs are stored as
 * `agency_tov_posts` (deduplicated), the agents read the stored rows, and the
 * result becomes a research run plus document versions whose citations point at
 * post rows. With `--persist` and no input, the stored corpus is analysed again.
 * Steps already completed are reused from `<out>/cache`.
 */
const run: ModuleCli = {
  command: 'run',
  async run(rest: string[]) {
    const args = parseArgs(rest ?? [])
    const brand = args.brand
    const out = args.out
    if (!brand || !out) throw new Error('[internal] --brand and --out are required')
    const lang = (args.lang ?? 'en') as TovOutputLanguage
    if (!tovOutputLanguages.includes(lang)) throw new Error(`[internal] --lang must be one of ${tovOutputLanguages.join(', ')}`)
    fs.mkdirSync(out, { recursive: true })

    const runner = args.runner ?? 'orchestrator'
    const persist = args.persist === 'true'
    const db = persist || runner !== 'direct' ? await connectDb() : null
    const scope = db ? await resolveScope(db, args) : null
    const runAgent = runner === 'direct' ? directRunner(args) : await orchestratorRunner(db!, scope!, args)
    const groundingLog: unknown[] = []

    const inputs = await collectInputs(args, brand, lang, out, runAgent)
    let posts: TovPost[]
    let stored: StoredCorpus | null = null
    if (persist) {
      stored = await persistInputs(db!, scope!, brand, args, inputs)
      posts = stored.posts
    } else {
      const parts = [inputs.file, inputs.scraped?.corpus].filter((part): part is NormalizeResult => part != null)
      if (parts.length === 0) throw new Error('[internal] give --file, --scrape and/or --discover (or --persist to reuse the stored corpus)')
      posts = mergeCorpora(parts).posts
      if (args.profile) posts = posts.filter((p) => p.profileUrl === args.profile)
    }
    if (args.limit) {
      posts = posts.slice(0, Number(args.limit))
      if (stored) stored = { ...stored, posts, rowIds: stored.rowIds.slice(0, posts.length) }
    }
    if (posts.length === 0) throw new Error('[internal] no posts to analyse — every source came back empty; add another source or check the scrape report')
    fs.writeFileSync(path.join(out, 'corpus.json'), JSON.stringify({ posts }, null, 2))

    const researchRun =
      stored && db && scope
        ? await startResearchRun(db.em, scope, {
            brand,
            outputLanguage: lang,
            runner,
            models: runner === 'direct' ? directModels(args) : null,
            corpus: stored,
          })
        : null
    if (researchRun && scope) console.log(`Research run ${researchRun.id} (tenant=${scope.tenantId} org=${scope.organizationId})`)

    let result: TovPipelineResult
    try {
      result = await runTovPipeline({
        posts,
        brand,
        outputLanguage: lang,
        runAgent,
        batchSize: args['batch-size'] ? Number(args['batch-size']) : undefined,
        concurrency: args.concurrency ? Number(args.concurrency) : undefined,
        cache: fileCache(path.join(out, 'cache')),
        onEvent: (event) => {
          if (event.type === 'grounding' || event.type === 'grounding_rejected') groundingLog.push(event)
          if (event.type === 'grounding' && event.dropped > 0) console.log(`  grounding ${event.step}: kept ${event.kept}, dropped ${event.dropped} (${event.issues.map((i) => i.reason).join(', ')})`)
          if (event.type === 'grounding_rejected') console.warn(`  grounding REJECTED ${event.step} (attempt ${event.attempt}): ${event.issues.length} issues — re-requesting`)
          if (event.type === 'plan') console.log(`Plan: ${event.posts} posts, ${event.profiles} profiles, ${event.batches} batches`)
          if (event.type === 'batch') console.log(`  batch ${event.index + 1}/${event.total} ${slug(event.profileUrl)} ${event.cached ? '(cached)' : `${event.ms} ms`}`)
          if (event.type === 'profile') console.log(`  profile ${slug(event.profileUrl)} ${event.cached ? '(cached)' : `${event.ms} ms`}`)
          if (event.type === 'brand') console.log(`  brand ${event.cached ? '(cached)' : `${event.ms} ms`}`)
        },
      })
    } catch (err) {
      if (researchRun && db) {
        await finishResearchRun(db.em, researchRun, { status: 'failed', error: err instanceof Error ? err.message : String(err), groundingReport: groundingLog })
        console.error(`Research run ${researchRun.id} marked failed`)
      }
      throw err
    }

    writeOutputs(out, result, posts, groundingLog)
    if (researchRun && db && scope && stored) {
      await persistOutputs(db, scope, brand, researchRun.id, result, stored)
      await finishResearchRun(db.em, researchRun, { status: 'done', stats: result.stats, groundingReport: groundingLog })
    }
    const summary = renderRunSummary(result)
    console.log(summary)
    console.log(`Written to ${path.resolve(out)}`)
  },
}

/**
 * Stores a scraped export as corpus rows without running any agent.
 *
 *   yarn mercato agency_tov import --brand "Open Mercato" --file <apify-export.json> [--source linkedin] [--tenant <id> --org <id>]
 *
 * Idempotent: posts already stored (same source, same platform id) are counted,
 * not duplicated. A later `run --persist` without `--file` analyses what is stored.
 */
const importCommand: ModuleCli = {
  command: 'import',
  async run(rest: string[]) {
    const args = parseArgs(rest ?? [])
    if (!args.brand || !args.file) throw new Error('[internal] --brand and --file are required')
    const source = (args.source ?? 'linkedin') as TovSource
    const corpus = loadCorpusFile(args.file, source)
    console.log(`Loaded ${corpus.posts.length} posts from ${args.file} (${corpus.skipped.length} skipped)`)
    const db = await connectDb()
    const scope = await resolveScope(db, args)
    const result = await importCorpus(db.em, scope, { brand: args.brand, mode: 'file', targets: [{ source, url: args.file }], reports: corpus.skipped, corpus })
    console.log(`Scrape run ${result.run.id} (tenant=${scope.tenantId} org=${scope.organizationId}): ${result.added} new posts, ${result.existing} already stored`)
    for (const stored of result.sources) console.log(`  ${stored.source} ${stored.profileUrl} — ${stored.displayName} (${stored.id})`)
  },
}

const agencyTovCliCommands: ModuleCli[] = [run, importCommand]

export default agencyTovCliCommands
