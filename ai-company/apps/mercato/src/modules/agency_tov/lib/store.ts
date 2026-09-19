import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  AgencyTovDocument,
  AgencyTovDocumentVersion,
  AgencyTovPost,
  AgencyTovResearchRun,
  AgencyTovScrapeRun,
  AgencyTovSource,
} from '../data/entities'
import type {
  TovBrandVoice,
  TovCitation,
  TovDocumentKind,
  TovOutputLanguage,
  TovPost,
  TovPostMediaKind,
  TovProfileVoice,
  TovSource,
} from '../data/validators'
import { groupByProfile, profileMetaFor, type NormalizeResult } from './corpus'
import type { TovScrapeTarget } from './corpus/sources'
import { quoteIsVerbatim } from './tov/grounding'
import type { TovPipelineResult } from './tov/pipeline'

/**
 * Persistence for the tone-of-voice lane. The pipeline stays pure and file-free;
 * this is the one place that knows the corpus can live in `agency_tov_posts` and
 * a synthesis in `agency_tov_document_versions`. Every function takes the tenant
 * scope explicitly — the CLI resolves it once, an API route gets it from auth.
 */

export type TovScope = { tenantId: string; organizationId: string }

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** A stored row as the shape the pipeline and the grounding gate read. `id` is the platform id the agents cite. */
export function postRowToTovPost(row: AgencyTovPost, source: Pick<AgencyTovSource, 'source' | 'profileUrl'>): TovPost {
  return {
    id: row.externalId,
    source: source.source as TovSource,
    profileUrl: source.profileUrl,
    authorName: row.authorName,
    url: row.url,
    postedAt: row.postedAt.toISOString(),
    text: row.text,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    media: row.media as TovPostMediaKind,
  }
}

export type PostRowRef = { id: string; url: string; profileUrl: string }

type Cited = { exemplars: { postId: string; quote: string; profileUrl?: string }[]; hooks: { examples: string[] } }

/**
 * Resolves every quoted thing in a synthesis to the stored post it came from.
 * Exemplars carry the id the gate already verified; a hook example carries none,
 * so it is attributed to the first post (within the evidence set) that contains
 * it verbatim — the same test the gate applied. A quote that resolves to no row
 * is not silently kept: it is left out of the citations, which the caller can
 * compare against the body.
 */
export function citationsOf(voice: Cited, posts: TovPost[], rowOf: (postId: string) => PostRowRef | null): TovCitation[] {
  const citations: TovCitation[] = []
  voice.exemplars.forEach((exemplar, index) => {
    const row = rowOf(exemplar.postId)
    if (!row) return
    citations.push({
      path: `exemplars[${index}]`,
      postId: exemplar.postId,
      postRowId: row.id,
      profileUrl: row.profileUrl,
      url: row.url,
      quote: exemplar.quote,
    })
  })
  voice.hooks.examples.forEach((example, index) => {
    const post = posts.find((candidate) => quoteIsVerbatim(example, candidate.text))
    const row = post ? rowOf(post.id) : null
    if (!post || !row) return
    citations.push({
      path: `hooks.examples[${index}]`,
      postId: post.id,
      postRowId: row.id,
      profileUrl: row.profileUrl,
      url: row.url,
      quote: example,
    })
  })
  return citations
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export type ImportCorpusInput = {
  brand: string
  mode: 'file' | 'apify'
  targets: TovScrapeTarget[]
  reports: unknown
  corpus: NormalizeResult
}

export type ImportCorpusResult = {
  run: AgencyTovScrapeRun
  sources: AgencyTovSource[]
  added: number
  existing: number
}

/**
 * Stores a normalised corpus. Idempotent on (source, external id): re-importing
 * the same export adds nothing and says so in the scrape run. Display names are
 * derived per profile the same way the pipeline does, so a stored source and a
 * file run name the same person the same way.
 */
export async function importCorpus(em: EntityManager, scope: TovScope, input: ImportCorpusInput): Promise<ImportCorpusResult> {
  const run = em.create(AgencyTovScrapeRun, {
    ...scope,
    brand: input.brand,
    mode: input.mode,
    targets: input.targets,
    reports: input.reports,
    postsAdded: 0,
    postsExisting: 0,
    postsSkipped: input.corpus.skipped.length,
  })
  em.persist(run)
  await em.flush()

  const sources: AgencyTovSource[] = []
  let added = 0
  let existing = 0
  for (const [profileUrl, posts] of groupByProfile(input.corpus.posts)) {
    const meta = profileMetaFor(profileUrl, posts)
    let source = await em.findOne(AgencyTovSource, { ...scope, source: meta.source, profileUrl, deletedAt: null })
    if (!source) {
      source = em.create(AgencyTovSource, { ...scope, source: meta.source, profileUrl, displayName: meta.displayName })
      em.persist(source)
      await em.flush()
    }
    sources.push(source)

    const known = new Set(
      (await em.find(AgencyTovPost, { ...scope, sourceId: source.id }, { fields: ['externalId'] })).map((row) => row.externalId),
    )
    for (const post of posts) {
      if (known.has(post.id)) {
        existing += 1
        continue
      }
      known.add(post.id)
      em.persist(
        em.create(AgencyTovPost, {
          ...scope,
          sourceId: source.id,
          scrapeRunId: run.id,
          externalId: post.id,
          url: post.url,
          authorName: post.authorName,
          postedAt: new Date(post.postedAt),
          text: post.text,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          media: post.media,
        }),
      )
      added += 1
    }
    await em.flush()
  }
  run.postsAdded = added
  run.postsExisting = existing
  await em.flush()
  return { run, sources, added, existing }
}

export type StoredCorpus = {
  posts: TovPost[]
  sources: AgencyTovSource[]
  /** Platform post id → stored row reference, for citations. */
  rowOf: (postId: string) => PostRowRef | null
  /** `agency_tov_posts.id` in the order `posts` are returned. */
  rowIds: string[]
}

/** Reads the stored corpus, optionally only some profiles, in the order the pipeline batches it. */
export async function loadCorpus(em: EntityManager, scope: TovScope, filter: { profileUrls?: string[] } = {}): Promise<StoredCorpus> {
  const where = filter.profileUrls?.length ? { ...scope, deletedAt: null, profileUrl: { $in: filter.profileUrls } } : { ...scope, deletedAt: null }
  const sources = await findWithDecryption(em, AgencyTovSource, where, { orderBy: { profileUrl: 'asc' } }, scope)
  const posts: TovPost[] = []
  const rowIds: string[] = []
  const refs = new Map<string, PostRowRef>()
  for (const source of sources) {
    const rows = await findWithDecryption(
      em,
      AgencyTovPost,
      { ...scope, sourceId: source.id },
      { orderBy: { postedAt: 'asc', externalId: 'asc' } },
      scope,
    )
    for (const row of rows) {
      posts.push(postRowToTovPost(row, source))
      rowIds.push(row.id)
      refs.set(row.externalId, { id: row.id, url: row.url, profileUrl: source.profileUrl })
    }
  }
  return { posts, sources, rowOf: (postId) => refs.get(postId) ?? null, rowIds }
}

// ---------------------------------------------------------------------------
// Research runs and document versions
// ---------------------------------------------------------------------------

export type StartResearchRunInput = {
  brand: string
  outputLanguage: TovOutputLanguage
  runner: string
  models: unknown
  corpus: StoredCorpus
}

/** Records the run before the first agent call, so a crash leaves a `running` row, never nothing. */
export async function startResearchRun(em: EntityManager, scope: TovScope, input: StartResearchRunInput): Promise<AgencyTovResearchRun> {
  const run = em.create(AgencyTovResearchRun, {
    ...scope,
    brand: input.brand,
    outputLanguage: input.outputLanguage,
    runner: input.runner,
    models: input.models ?? {},
    status: 'running',
    postIds: input.corpus.rowIds,
    postCount: input.corpus.posts.length,
    profileCount: groupByProfile(input.corpus.posts).size,
  })
  em.persist(run)
  await em.flush()
  return run
}

export async function finishResearchRun(
  em: EntityManager,
  run: AgencyTovResearchRun,
  outcome: { status: 'done'; stats: TovPipelineResult['stats']; groundingReport: unknown } | { status: 'failed'; error: string; groundingReport: unknown },
): Promise<void> {
  run.status = outcome.status
  run.groundingReport = outcome.groundingReport
  run.finishedAt = new Date()
  if (outcome.status === 'done') run.stats = outcome.stats
  else run.error = outcome.error
  await em.flush()
}

export type SaveVersionInput = {
  brand: string
  kind: TovDocumentKind
  /** '' for the brand document. */
  profileUrl: string
  title: string
  researchRunId: string
  body: TovBrandVoice | TovProfileVoice
  renderedMd: string
  citations: TovCitation[]
}

/**
 * Appends a version to the (brand, kind, profile) document, creating the document
 * on first use, and moves `current_version_id`. Versions are never updated; a new
 * run over the same brand is a new version.
 */
export async function saveDocumentVersion(
  em: EntityManager,
  scope: TovScope,
  input: SaveVersionInput,
): Promise<{ document: AgencyTovDocument; version: AgencyTovDocumentVersion }> {
  let document = await em.findOne(AgencyTovDocument, {
    ...scope,
    brand: input.brand,
    kind: input.kind,
    profileUrl: input.profileUrl,
    deletedAt: null,
  })
  if (!document) {
    document = em.create(AgencyTovDocument, { ...scope, brand: input.brand, kind: input.kind, profileUrl: input.profileUrl, title: input.title })
    em.persist(document)
    await em.flush()
  }
  const latest = await em.findOne(AgencyTovDocumentVersion, { documentId: document.id }, { orderBy: { versionNo: 'desc' } })
  const version = em.create(AgencyTovDocumentVersion, {
    ...scope,
    documentId: document.id,
    versionNo: (latest?.versionNo ?? 0) + 1,
    researchRunId: input.researchRunId,
    body: JSON.stringify(input.body),
    renderedMd: input.renderedMd,
    citations: input.citations,
  })
  em.persist(version)
  await em.flush()
  document.currentVersionId = version.id
  document.title = input.title
  await em.flush()
  return { document, version }
}
