import type { TovSource } from '../../data/validators'
import type { ApifyClient } from './apify'
import { normalizeGenericPosts, type GenericFieldMap } from './generic'
import { mergeCorpora, type NormalizeResult } from './index'
import { normalizeLinkedInPosts, type ApifyLinkedInPostItem } from './linkedin'

/** One thing to scrape: a profile, page, handle or site, on one platform. */
export type TovScrapeTarget = { source: TovSource; url: string }

export type TovSourceAdapter = {
  source: TovSource
  /** Apify actor, overridable per deployment through `actorIdEnv`. */
  defaultActorId: string
  actorIdEnv: string
  buildInput: (targets: TovScrapeTarget[], opts: { maxPosts: number }) => Record<string, unknown>
  normalize: (items: unknown[], targets: TovScrapeTarget[]) => NormalizeResult
}

function handleOf(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop()?.replace(/^@/, '') ?? url
}

function generic(source: TovSource, fields: GenericFieldMap, targets: TovScrapeTarget[], items: unknown[]): NormalizeResult {
  const fallback = targets[0]?.url ?? source
  return normalizeGenericPosts(items, { source, fields, fallbackProfileUrl: fallback })
}

/**
 * Actor ids and field maps are the best-known public actors as of 2026-09; a
 * deployment can swap any of them with the env override without code changes, and
 * the generic normalizer tolerates field drift by falling back to skips.
 */
export const tovSourceAdapters: Record<Exclude<TovSource, 'youtube' | 'other'>, TovSourceAdapter> = {
  linkedin: {
    source: 'linkedin',
    defaultActorId: 'harvestapi/linkedin-profile-posts',
    actorIdEnv: 'OM_AGENCY_TOV_APIFY_ACTOR_LINKEDIN',
    buildInput: (targets, { maxPosts }) => ({ targetUrls: targets.map((t) => t.url), maxPosts }),
    normalize: (items) => normalizeLinkedInPosts(items as ApifyLinkedInPostItem[]),
  },
  x: {
    source: 'x',
    defaultActorId: 'apidojo/tweet-scraper',
    actorIdEnv: 'OM_AGENCY_TOV_APIFY_ACTOR_X',
    buildInput: (targets, { maxPosts }) => ({
      twitterHandles: targets.map((t) => handleOf(t.url)),
      maxItems: maxPosts,
      includeSearchTerms: false,
      onlyVerifiedUsers: false,
    }),
    normalize: (items, targets) =>
      generic(
        'x',
        {
          id: ['id', 'tweetId'],
          text: ['fullText', 'text'],
          url: ['url', 'twitterUrl'],
          postedAt: ['createdAt', 'created_at'],
          authorName: ['author.name', 'user.name'],
          profileUrl: ['author.url', 'author.twitterUrl'],
          likes: ['likeCount', 'favorite_count'],
          comments: ['replyCount', 'reply_count'],
          shares: ['retweetCount', 'retweet_count'],
          videoFlag: ['extendedEntities.media.0.video_info'],
          imageFlag: ['extendedEntities.media', 'media'],
        },
        targets,
        items,
      ),
  },
  facebook: {
    source: 'facebook',
    defaultActorId: 'apify/facebook-posts-scraper',
    actorIdEnv: 'OM_AGENCY_TOV_APIFY_ACTOR_FACEBOOK',
    buildInput: (targets, { maxPosts }) => ({ startUrls: targets.map((t) => ({ url: t.url })), resultsLimit: maxPosts }),
    normalize: (items, targets) =>
      generic(
        'facebook',
        {
          id: ['postId', 'id'],
          text: ['text', 'message'],
          url: ['url', 'topLevelUrl'],
          postedAt: ['time', 'timestamp', 'publishedAt'],
          authorName: ['user.name', 'pageName'],
          profileUrl: ['user.profileUrl', 'facebookUrl', 'pageUrl'],
          likes: ['likes', 'reactionsCount'],
          comments: ['comments', 'commentsCount'],
          shares: ['shares', 'sharesCount'],
          videoFlag: ['media.0.video', 'videoUrl'],
          imageFlag: ['media', 'imageUrl'],
        },
        targets,
        items,
      ),
  },
  instagram: {
    source: 'instagram',
    defaultActorId: 'apify/instagram-scraper',
    actorIdEnv: 'OM_AGENCY_TOV_APIFY_ACTOR_INSTAGRAM',
    buildInput: (targets, { maxPosts }) => ({ directUrls: targets.map((t) => t.url), resultsType: 'posts', resultsLimit: maxPosts }),
    normalize: (items, targets) =>
      generic(
        'instagram',
        {
          id: ['id', 'shortCode'],
          text: ['caption'],
          url: ['url'],
          postedAt: ['timestamp'],
          authorName: ['ownerFullName', 'ownerUsername'],
          profileUrl: ['inputUrl'],
          likes: ['likesCount'],
          comments: ['commentsCount'],
          shares: ['sharesCount'],
          videoFlag: ['videoUrl'],
          imageFlag: ['displayUrl'],
        },
        targets,
        items,
      ),
  },
  website: {
    source: 'website',
    defaultActorId: 'apify/website-content-crawler',
    actorIdEnv: 'OM_AGENCY_TOV_APIFY_ACTOR_WEBSITE',
    buildInput: (targets, { maxPosts }) => ({
      startUrls: targets.map((t) => ({ url: t.url })),
      maxCrawlPages: maxPosts,
      crawlerType: 'cheerio',
      saveMarkdown: false,
      removeElementsCssSelector: 'nav, footer, header, aside, script, style, noscript',
    }),
    normalize: (items, targets) =>
      normalizeGenericPosts(items, {
        source: 'website',
        fields: {
          id: ['url'],
          text: ['text', 'markdown'],
          url: ['url'],
          postedAt: ['metadata.publishedAt', 'metadata.datePublished', 'crawl.loadedTime'],
          authorName: ['metadata.author', 'metadata.title'],
          profileUrl: [],
          likes: [],
          comments: [],
          shares: [],
        },
        fallbackProfileUrl: targets[0]?.url ?? 'website',
        fallbackAuthorName: new URL(targets[0]?.url ?? 'https://website').hostname,
        minTextLength: 300,
      }),
  },
}

export function actorIdFor(adapter: TovSourceAdapter, env: NodeJS.ProcessEnv = process.env): string {
  return env[adapter.actorIdEnv]?.trim() || adapter.defaultActorId
}

export type ScrapeReport = {
  source: TovSource
  actorId: string
  targets: string[]
  items: number
  posts: number
  error: string | null
}

/**
 * Scrapes every target through its source adapter and merges the corpora. A source
 * that fails or returns nothing is REPORTED, not fatal: the ToV can be built from
 * whatever the other sources found, and the caller decides whether that is enough.
 */
export async function scrapeTargets(
  client: ApifyClient,
  targets: TovScrapeTarget[],
  opts: { maxPostsPerSource: number; env?: NodeJS.ProcessEnv; log?: (message: string) => void },
): Promise<{ corpus: NormalizeResult; reports: ScrapeReport[] }> {
  const bySource = new Map<TovSource, TovScrapeTarget[]>()
  for (const target of targets) bySource.set(target.source, [...(bySource.get(target.source) ?? []), target])
  const parts: NormalizeResult[] = []
  const reports: ScrapeReport[] = []
  for (const [source, sourceTargets] of bySource) {
    const adapter = (tovSourceAdapters as Partial<Record<TovSource, TovSourceAdapter>>)[source]
    if (!adapter) {
      reports.push({ source, actorId: '', targets: sourceTargets.map((t) => t.url), items: 0, posts: 0, error: 'no adapter for source' })
      continue
    }
    const actorId = actorIdFor(adapter, opts.env)
    try {
      const items = await client.runActorAndCollect(
        actorId,
        adapter.buildInput(sourceTargets, { maxPosts: opts.maxPostsPerSource }),
        opts.maxPostsPerSource * Math.max(1, sourceTargets.length),
      )
      const normalized = adapter.normalize(items, sourceTargets)
      parts.push(normalized)
      reports.push({ source, actorId, targets: sourceTargets.map((t) => t.url), items: items.length, posts: normalized.posts.length, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      opts.log?.(`${source}: ${message}`)
      reports.push({ source, actorId, targets: sourceTargets.map((t) => t.url), items: 0, posts: 0, error: message })
    }
  }
  return { corpus: mergeCorpora(parts), reports }
}
