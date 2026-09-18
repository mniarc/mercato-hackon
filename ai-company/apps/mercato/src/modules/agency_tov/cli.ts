import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAgentEntry } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import type { AgentRuntimeService } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
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
import { mergeCorpora, type NormalizeResult } from './lib/corpus'
import { createApifyClient } from './lib/corpus/apify'
import { normalizeLinkedInPosts } from './lib/corpus/linkedin'
import { scrapeTargets, tovSourceAdapters, type TovScrapeTarget } from './lib/corpus/sources'
import { runTovPipeline, type TovAgentRunner, type TovPipelineCache } from './lib/tov/pipeline'
import { renderBrandTov, renderProfileVoice, renderRunSummary } from './lib/tov/render'

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^-+/, '')
    const value = args[i + 1]
    if (key && value !== undefined) result[key] = value
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

/**
 * Runs every agent through the Agent Orchestrator: persisted `agent_runs`, admission
 * gate, provider budget, guardrails and the Backend → Agents cockpit see each call.
 */
async function orchestratorRunner(args: Record<string, string>): Promise<TovAgentRunner> {
  const { resolve } = await createRequestContainer()
  const em = (resolve('em') as EntityManager).fork()
  const connection = em.getConnection()
  let tenantId: string = args.tenant ?? ''
  let organizationId: string = args.org ?? ''
  if (!tenantId || !organizationId) {
    const rows = await connection.execute(`select id, tenant_id from organizations where deleted_at is null order by created_at asc limit 1`)
    const first = Array.isArray(rows) ? rows[0] : null
    if (!first) throw new Error('[internal] no organization found — pass --tenant and --org')
    organizationId = organizationId || String(first.id)
    tenantId = tenantId || String(first.tenant_id)
  }
  let userId: string = args.user ?? ''
  if (!userId) {
    const rows = await connection.execute(`select id from users where tenant_id = ? and deleted_at is null order by created_at asc limit 1`, [tenantId])
    userId = Array.isArray(rows) && rows[0] ? String(rows[0].id) : ''
    if (!userId) throw new Error('[internal] no user found in tenant — pass --user')
  }
  const agentRuntime = resolve('agentRuntime') as AgentRuntimeService
  const ctx = { tenantId, organizationId, userId }
  console.log(`Runner: agent_orchestrator (tenant=${ctx.tenantId} org=${ctx.organizationId} user=${ctx.userId})`)
  return (agentId, input, opts) => agentRuntime.run(agentId, input, { ...ctx, runTimeoutMs: opts.runTimeoutMs })
}

/**
 * Prompt iteration without the platform: the same registered instructions and
 * schemas, one bare structured-output call per step. Nothing is persisted.
 */
function directRunner(args: Record<string, string>): TovAgentRunner {
  const openrouterKey = process.env.OPENROUTER_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openrouterKey && !openaiKey) throw new Error('[internal] --runner direct needs OPENROUTER_API_KEY or OPENAI_API_KEY')
  const provider = openrouterKey
    ? createOpenAI({ apiKey: openrouterKey, baseURL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1' })
    : createOpenAI({ apiKey: openaiKey })
  const analysisModel = args.model ?? process.env.OM_AGENCY_TOV_MODEL ?? (openrouterKey ? 'anthropic/claude-haiku-4.5' : 'gpt-5-mini')
  const synthesisModel =
    args['synthesis-model'] ?? process.env.OM_AGENCY_TOV_SYNTHESIS_MODEL ?? (openrouterKey ? 'anthropic/claude-sonnet-5' : 'gpt-5')
  const modelFor = (agentId: string) => (agentId === TOV_BATCH_ANALYST_AGENT_ID ? analysisModel : synthesisModel)
  console.log(`Runner: direct (${openrouterKey ? 'openrouter' : 'openai'}; analysis ${analysisModel}, synthesis ${synthesisModel})`)
  return async (agentId, input, opts) => {
    const entry = getAgentEntry(agentId)
    if (!entry) throw new Error(`[internal] unknown agent ${agentId}`)
    // Provider-side structured output compiles the schema into a grammar; Anthropic
    // rejects the larger synthesis schemas as "too large". Asking for JSON in the
    // prompt and validating with zod works for every schema and every provider.
    const schemaJson = JSON.stringify(z.toJSONSchema(entry.schema))
    let text = ''
    try {
      const result = await generateText({
        model: provider.chat(modelFor(agentId)),
        system: `${entry.instructions}

Respond with ONLY one JSON object (no prose, no code fences) that validates against this JSON Schema:
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
      const body = err && typeof err === 'object' && 'responseBody' in err ? String((err as { responseBody?: unknown }).responseBody ?? '') : ''
      const file = path.join(args.out, `failed-${agentId}-${Date.now()}.txt`)
      fs.writeFileSync(file, `${err instanceof Error ? err.message : String(err)}

${text || body}`)
      console.error(`${agentId}: failed — details in ${file}`)
      throw err
    }
  }
}

/**
 * Builds the tone-of-voice document for a brand from what its people publish.
 *
 *   yarn mercato agency_tov run --brand "Open Mercato" --out output/tov \
 *     [--file <apify-export.json> [--source linkedin]] \
 *     [--scrape linkedin=https://www.linkedin.com/in/x/,website=https://example.com] \
 *     [--max-posts 500] [--lang en|pl] [--batch-size 40] [--concurrency 4] [--limit N] \
 *     [--runner orchestrator|direct] [--model <analysis id>] [--synthesis-model <id>] [--tenant <id> --org <id> --user <id>]
 *
 * `--file` reads a corpus already scraped (an Apify dataset export, or a
 * `corpus.json` this command wrote); `--scrape` runs Apify live (`APIFY_TOKEN`);
 * `--discover` first asks the web-enabled scout agent where these people publish
 * and scrapes what it finds (plus any `--scrape` targets). All three combine.
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

    const runAgent = (args.runner ?? 'orchestrator') === 'direct' ? directRunner(args) : await orchestratorRunner(args)

    const parts: NormalizeResult[] = []
    if (args.file) {
      const source = (args.source ?? 'linkedin') as TovSource
      const loaded = loadCorpusFile(args.file, source)
      console.log(`Loaded ${loaded.posts.length} posts from ${args.file} (${loaded.skipped.length} skipped)`)
      parts.push(loaded)
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
      parts.push(corpus)
    }
    if (parts.length === 0) throw new Error('[internal] give --file, --scrape and/or --discover')

    let { posts } = mergeCorpora(parts)
    if (args.profile) posts = posts.filter((p) => p.profileUrl === args.profile)
    if (args.limit) posts = posts.slice(0, Number(args.limit))
    if (posts.length === 0) throw new Error('[internal] no posts to analyse — every source came back empty; add another source or check the scrape report')
    fs.writeFileSync(path.join(out, 'corpus.json'), JSON.stringify({ posts }, null, 2))

    const result = await runTovPipeline({
      posts,
      brand,
      outputLanguage: lang,
      runAgent,
      batchSize: args['batch-size'] ? Number(args['batch-size']) : undefined,
      concurrency: args.concurrency ? Number(args.concurrency) : undefined,
      cache: fileCache(path.join(out, 'cache')),
      onEvent: (event) => {
        if (event.type === 'plan') console.log(`Plan: ${event.posts} posts, ${event.profiles} profiles, ${event.batches} batches`)
        if (event.type === 'batch') console.log(`  batch ${event.index + 1}/${event.total} ${slug(event.profileUrl)} ${event.cached ? '(cached)' : `${event.ms} ms`}`)
        if (event.type === 'profile') console.log(`  profile ${slug(event.profileUrl)} ${event.cached ? '(cached)' : `${event.ms} ms`}`)
        if (event.type === 'brand') console.log(`  brand ${event.cached ? '(cached)' : `${event.ms} ms`}`)
      },
    })

    const profilesDir = path.join(out, 'profiles')
    fs.mkdirSync(profilesDir, { recursive: true })
    for (const profile of result.profiles) {
      const base = path.join(profilesDir, slug(profile.profile.profileUrl))
      fs.writeFileSync(`${base}.json`, JSON.stringify(profile, null, 2))
      fs.writeFileSync(`${base}.md`, renderProfileVoice(profile.profile, profile.voice))
    }
    fs.writeFileSync(path.join(out, 'brand.json'), JSON.stringify(result.brand, null, 2))
    fs.writeFileSync(path.join(out, 'KLI-TOV.md'), renderBrandTov(result.brand, result.profiles))
    const summary = renderRunSummary(result)
    fs.writeFileSync(path.join(out, 'run-summary.txt'), summary)
    console.log(summary)
    console.log(`Written to ${path.resolve(out)}`)
  },
}

const agencyTovCliCommands: ModuleCli[] = [run]

export default agencyTovCliCommands
