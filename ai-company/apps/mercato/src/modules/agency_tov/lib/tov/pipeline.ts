import { createHash } from 'node:crypto'
import {
  TOV_BATCH_ANALYST_AGENT_ID,
  TOV_BRAND_SYNTHESIZER_AGENT_ID,
  TOV_PROFILE_SYNTHESIZER_AGENT_ID,
} from '../agentIds'
import {
  tovBatchAnalystResult,
  tovBrandSynthesizerResult,
  tovProfileSynthesizerResult,
  type TovBatchAnalystInput,
  type TovBatchObservation,
  type TovBrandSynthesizerInput,
  type TovBrandVoice,
  type TovOutputLanguage,
  type TovPost,
  type TovProfileMeta,
  type TovProfileSynthesizerInput,
  type TovProfileVoice,
} from '../../data/validators'
import { batchPosts, dateRangeOf, mapWithConcurrency } from './batch'
import {
  groundBrandVoice,
  groundObservation,
  groundProfileVoice,
  GroundingError,
  type Grounded,
  type GroundingIssue,
  type GroundingRepair,
} from './grounding'
import { groupByProfile, profileMetaFor } from '../corpus'

/**
 * Map → reduce over a post corpus.
 *
 *   posts ──group by profile──▶ batches ──analyst (map, parallel)──▶ observations
 *         ──profile synthesizer (reduce per author)──▶ voice profiles
 *         ──brand synthesizer (reduce across authors)──▶ brand ToV (KLI-TOV)
 *
 * The pipeline owns batching, ordering, bookkeeping and result validation; the
 * agents only ever see one bounded input. `runAgent` is injected so the same code
 * runs through `agentRuntime.run()` (persisted `agent_runs`, admission, budgets)
 * from the CLI/worker, and through a bare model call in a prompt dry-run.
 */

export type TovAgentRunner = (
  agentId: string,
  input: unknown,
  opts: { runTimeoutMs: number },
) => Promise<unknown>

/** Optional resume store: a rerun after a crash skips every step already done. */
export type TovPipelineCache = {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
}

export type TovPipelineEvent =
  | { type: 'plan'; profiles: number; batches: number; posts: number }
  | { type: 'grounding'; step: string; kept: number; dropped: number; issues: GroundingIssue[]; repairs: GroundingRepair[] }
  | { type: 'grounding_rejected'; step: string; attempt: number; issues: GroundingIssue[] }
  | { type: 'batch'; profileUrl: string; index: number; total: number; cached: boolean; ms: number }
  | { type: 'profile'; profileUrl: string; cached: boolean; ms: number }
  | { type: 'brand'; cached: boolean; ms: number }

export type TovPipelineOptions = {
  posts: TovPost[]
  brand: string
  outputLanguage: TovOutputLanguage
  runAgent: TovAgentRunner
  batchSize?: number
  maxBatchChars?: number
  concurrency?: number
  /** How many times a result rejected by the grounding gate is re-requested. */
  groundingRetries?: number
  /** Analyst calls read ~7k tokens; synthesizer calls read up to ~60k. */
  batchTimeoutMs?: number
  synthesisTimeoutMs?: number
  cache?: TovPipelineCache
  onEvent?: (event: TovPipelineEvent) => void
}

export type TovBatchResult = {
  index: number
  total: number
  postIds: string[]
  postCount: number
  dateRange: { from: string; to: string }
  observation: TovBatchObservation
}

export type TovProfileResult = {
  profile: TovProfileMeta
  batches: TovBatchResult[]
  voice: TovProfileVoice
}

export type TovPipelineResult = {
  brand: TovBrandVoice
  profiles: TovProfileResult[]
  stats: {
    posts: number
    profiles: number
    batches: number
    agentCalls: number
    cachedSteps: number
    /** Evidence items the grounding gate removed (unknown post, non-verbatim quote, hook not in corpus). */
    ungroundedDropped: number
    /** Whole results the gate rejected and re-requested. */
    groundingRejections: number
  }
}

const DEFAULT_CONCURRENCY = 4
const DEFAULT_GROUNDING_RETRIES = 2
const DEFAULT_BATCH_TIMEOUT_MS = 4 * 60_000
const DEFAULT_SYNTHESIS_TIMEOUT_MS = 10 * 60_000

function fingerprint(parts: unknown): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16)
}

export async function runTovPipeline(opts: TovPipelineOptions): Promise<TovPipelineResult> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY
  const batchTimeoutMs = opts.batchTimeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS
  const synthesisTimeoutMs = opts.synthesisTimeoutMs ?? DEFAULT_SYNTHESIS_TIMEOUT_MS
  const emit = opts.onEvent ?? (() => {})
  const groundingRetries = opts.groundingRetries ?? DEFAULT_GROUNDING_RETRIES
  const stats = {
    posts: opts.posts.length,
    profiles: 0,
    batches: 0,
    agentCalls: 0,
    cachedSteps: 0,
    ungroundedDropped: 0,
    groundingRejections: 0,
  }

  // A step = (cache key, producer, grounding gate). Schema validation proves the
  // SHAPE; the gate proves the EVIDENCE (every cited post exists, every quote is
  // verbatim). Only grounded results are cached, so a resume never replays an
  // invented one; a result with nothing grounded is re-requested up to
  // `groundingRetries` times and then fails the run — never filled in.
  const step = async <D>(
    name: string,
    key: string,
    schema: { parse: (v: unknown) => { kind: 'research'; data: D } },
    ground: (data: D) => Grounded<D>,
    produce: () => Promise<unknown>,
  ): Promise<{ value: D; cached: boolean }> => {
    const cached = opts.cache ? await opts.cache.get(key) : null
    if (cached != null) {
      stats.cachedSteps += 1
      // Cached before the gate existed, or by an older gate: judge it again — it is
      // deterministic and free. A cached result that cannot be grounded is simply
      // re-requested below instead of being trusted.
      try {
        const grounded = ground(schema.parse(cached).data)
        stats.ungroundedDropped += grounded.dropped
        emit({ type: 'grounding', step: name, kept: grounded.kept, dropped: grounded.dropped, issues: grounded.issues, repairs: grounded.repairs })
        return { value: grounded.value, cached: true }
      } catch (err) {
        if (!(err instanceof GroundingError)) throw err
        stats.groundingRejections += 1
        emit({ type: 'grounding_rejected', step: name, attempt: 0, issues: err.issues })
      }
    }
    for (let attempt = 1; ; attempt += 1) {
      stats.agentCalls += 1
      const parsed = schema.parse(await produce())
      try {
        const grounded = ground(parsed.data)
        stats.ungroundedDropped += grounded.dropped
        emit({ type: 'grounding', step: name, kept: grounded.kept, dropped: grounded.dropped, issues: grounded.issues, repairs: grounded.repairs })
        if (opts.cache) await opts.cache.set(key, { kind: 'research', data: grounded.value })
        return { value: grounded.value, cached: false }
      } catch (err) {
        if (!(err instanceof GroundingError)) throw err
        stats.groundingRejections += 1
        emit({ type: 'grounding_rejected', step: name, attempt, issues: err.issues })
        if (attempt > groundingRetries) throw err
      }
    }
  }

  const groups = groupByProfile(opts.posts)
  const plan = [...groups.entries()].map(([profileUrl, posts]) => ({
    profile: profileMetaFor(profileUrl, posts),
    batches: batchPosts(posts, { batchSize: opts.batchSize, maxBatchChars: opts.maxBatchChars }),
  }))
  stats.profiles = plan.length
  stats.batches = plan.reduce((sum, p) => sum + p.batches.length, 0)
  emit({ type: 'plan', profiles: stats.profiles, batches: stats.batches, posts: stats.posts })

  // Map: every batch of every profile is independent → one flat parallel pass.
  const work = plan.flatMap((p) => p.batches.map((batch) => ({ profile: p.profile, batch, total: p.batches.length })))
  const observations = await mapWithConcurrency(work, concurrency, async ({ profile, batch, total }) => {
    const postIds = batch.posts.map((p) => p.id)
    const input: TovBatchAnalystInput = {
      profile,
      batch: { index: batch.index, total },
      outputLanguage: opts.outputLanguage,
      posts: batch.posts.map((p) => ({
        id: p.id,
        postedAt: p.postedAt,
        media: p.media,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        text: p.text,
      })),
    }
    const started = Date.now()
    const { value, cached } = await step(
      `batch ${batch.index + 1}/${total} ${profile.displayName}`,
      `batch:${fingerprint([profile.profileUrl, batch.index, postIds, opts.outputLanguage])}`,
      tovBatchAnalystResult,
      (data) => groundObservation(data, batch.posts),
      () => opts.runAgent(TOV_BATCH_ANALYST_AGENT_ID, input, { runTimeoutMs: batchTimeoutMs }),
    )
    emit({ type: 'batch', profileUrl: profile.profileUrl, index: batch.index, total, cached, ms: Date.now() - started })
    const result: TovBatchResult = {
      index: batch.index,
      total,
      postIds,
      postCount: batch.posts.length,
      dateRange: dateRangeOf(batch.posts),
      observation: value,
    }
    return { profileUrl: profile.profileUrl, result }
  })

  // Reduce 1: one synthesis per author over its observations (chronological).
  const profiles = await mapWithConcurrency(plan, concurrency, async ({ profile }) => {
    const batches = observations
      .filter((o) => o.profileUrl === profile.profileUrl)
      .map((o) => o.result)
      .sort((a, b) => a.index - b.index)
    const input: TovProfileSynthesizerInput = {
      profile,
      outputLanguage: opts.outputLanguage,
      observations: batches.map((b) => ({
        batchIndex: b.index,
        dateRange: b.dateRange,
        postCount: b.postCount,
        observation: b.observation,
      })),
    }
    const started = Date.now()
    const authorPosts = groups.get(profile.profileUrl) ?? []
    const { value, cached } = await step(
      `profile ${profile.displayName}`,
      `profile:${fingerprint([profile.profileUrl, batches.map((b) => b.observation), opts.outputLanguage])}`,
      tovProfileSynthesizerResult,
      (data) => groundProfileVoice(data, authorPosts),
      () => opts.runAgent(TOV_PROFILE_SYNTHESIZER_AGENT_ID, input, { runTimeoutMs: synthesisTimeoutMs }),
    )
    emit({ type: 'profile', profileUrl: profile.profileUrl, cached, ms: Date.now() - started })
    const result: TovProfileResult = { profile, batches, voice: value }
    return result
  })

  // Reduce 2: the brand document across authors.
  const brandInput: TovBrandSynthesizerInput = {
    brand: opts.brand,
    outputLanguage: opts.outputLanguage,
    profiles: profiles.map((p) => ({ profile: p.profile, voice: p.voice })),
  }
  const started = Date.now()
  const { value: brand, cached } = await step(
    'brand',
    `brand:${fingerprint([opts.brand, brandInput.profiles.map((p) => p.voice), opts.outputLanguage])}`,
    tovBrandSynthesizerResult,
    (data) => groundBrandVoice(data, opts.posts),
    () => opts.runAgent(TOV_BRAND_SYNTHESIZER_AGENT_ID, brandInput, { runTimeoutMs: synthesisTimeoutMs }),
  )
  emit({ type: 'brand', cached, ms: Date.now() - started })

  return { brand, profiles, stats }
}
