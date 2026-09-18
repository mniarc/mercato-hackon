import { groupByProfile, mergeCorpora, profileMetaFor } from '../lib/corpus'
import { normalizeGenericPosts } from '../lib/corpus/generic'
import { normalizeLinkedInPosts, type ApifyLinkedInPostItem } from '../lib/corpus/linkedin'
import { actorIdFor, scrapeTargets, tovSourceAdapters } from '../lib/corpus/sources'
import type { ApifyClient } from '../lib/corpus/apify'

const linkedInItem = (overrides: Partial<ApifyLinkedInPostItem> = {}): ApifyLinkedInPostItem => ({
  type: 'post',
  id: '1',
  linkedinUrl: 'https://www.linkedin.com/posts/x_1',
  content: 'We shipped it.',
  author: { name: 'Jane Doe', publicIdentifier: 'janedoe', linkedinUrl: 'https://www.linkedin.com/in/janedoe' },
  postedAt: { date: '2026-01-04T09:00:00.000Z', timestamp: 1767517200000 },
  engagement: { likes: 10, comments: 2, shares: 1 },
  query: { targetUrl: 'https://www.linkedin.com/in/janedoe/' },
  postImages: [],
  header: { text: '' },
  ...overrides,
})

describe('normalizeLinkedInPosts', () => {
  it('keeps the voice-relevant fields and derives media from the richest attachment', () => {
    const { posts, skipped } = normalizeLinkedInPosts([
      linkedInItem(),
      linkedInItem({ id: '2', postImages: [{}], postVideo: { url: 'v' } }),
      linkedInItem({ id: '3', article: { url: 'a' } }),
    ])
    expect(skipped).toEqual([])
    expect(posts.map((p) => p.media)).toEqual(['none', 'video', 'article'])
    expect(posts[0]).toMatchObject({
      id: '1',
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/janedoe/',
      authorName: 'Jane Doe',
      likes: 10,
      comments: 2,
      shares: 1,
    })
    expect(Object.keys(posts[0]).sort()).toEqual(
      ['authorName', 'comments', 'id', 'likes', 'media', 'postedAt', 'profileUrl', 'shares', 'source', 'text', 'url'].sort(),
    )
  })

  it('drops reposts, empty posts, non-posts and duplicates with a reason', () => {
    const { posts, skipped } = normalizeLinkedInPosts([
      linkedInItem({ id: 'r', header: { text: 'Jane Doe reposted this' } }),
      linkedInItem({ id: 'e', content: '   ' }),
      linkedInItem({ id: 'n', type: 'article' }),
      linkedInItem({ id: 'd' }),
      linkedInItem({ id: 'd' }),
    ])
    expect(posts.map((p) => p.id)).toEqual(['d'])
    expect(skipped.map((s) => s.reason)).toEqual(['repost', 'empty_text', 'not_a_post', 'duplicate'])
  })

  it('keys the author by the scrape target and normalises company page URLs', () => {
    const { posts } = normalizeLinkedInPosts([
      linkedInItem({ author: { name: 'Garbled,Tags,Here' }, query: { targetUrl: 'https://www.linkedin.com/company/acme/posts/?feedView=all' } }),
    ])
    expect(posts[0].profileUrl).toBe('https://www.linkedin.com/company/acme/')
  })
})

describe('profileMetaFor / groupByProfile', () => {
  it('picks the most frequent author name and the date range, and sorts posts chronologically', () => {
    const { posts } = normalizeLinkedInPosts([
      linkedInItem({ id: '1', postedAt: { date: '2026-03-01T00:00:00.000Z' } }),
      linkedInItem({ id: '2', postedAt: { date: '2026-01-01T00:00:00.000Z' }, author: { name: 'Typo Name' } }),
      linkedInItem({ id: '3', postedAt: { date: '2026-02-01T00:00:00.000Z' } }),
    ])
    const groups = groupByProfile(posts)
    const [profileUrl, group] = [...groups.entries()][0]
    expect(group.map((p) => p.id)).toEqual(['2', '3', '1'])
    expect(profileMetaFor(profileUrl, group)).toEqual({
      source: 'linkedin',
      profileUrl: 'https://www.linkedin.com/in/janedoe/',
      displayName: 'Jane Doe',
      postCount: 3,
      firstPostedAt: '2026-01-01T00:00:00.000Z',
      lastPostedAt: '2026-03-01T00:00:00.000Z',
    })
  })
})

describe('normalizeGenericPosts', () => {
  it('maps candidate paths in priority order and falls back to the scrape target', () => {
    const { posts, skipped } = normalizeGenericPosts(
      [
        { id: 't1', fullText: 'Hello world', createdAt: '2026-05-01T10:00:00Z', likeCount: '3', author: { name: 'A', url: 'https://x.com/a' } },
        { id: 't2', text: '' },
        { tweetId: 't3', text: 'No author here', createdAt: 1777630800 },
      ],
      {
        source: 'x',
        fallbackProfileUrl: 'https://x.com/target',
        fields: {
          id: ['id', 'tweetId'],
          text: ['fullText', 'text'],
          url: ['url'],
          postedAt: ['createdAt'],
          authorName: ['author.name'],
          profileUrl: ['author.url'],
          likes: ['likeCount'],
          comments: ['replyCount'],
          shares: ['retweetCount'],
        },
      },
    )
    expect(skipped).toEqual([{ reason: 'empty_text', id: 't2' }])
    expect(posts[0]).toMatchObject({ id: 't1', source: 'x', text: 'Hello world', likes: 3, profileUrl: 'https://x.com/a', authorName: 'A' })
    expect(posts[1]).toMatchObject({ id: 't3', profileUrl: 'https://x.com/target', postedAt: '2026-05-01T10:20:00.000Z' })
  })
})

describe('scrapeTargets', () => {
  const fakeClient = (handler: (actorId: string, input: Record<string, unknown>) => Promise<unknown[]>): ApifyClient =>
    ({ runActorAndCollect: (actorId: string, input: Record<string, unknown>) => handler(actorId, input) }) as unknown as ApifyClient

  it('reports an empty or failing source and still returns the others', async () => {
    const client = fakeClient(async (actorId) => {
      if (actorId.includes('linkedin')) return []
      if (actorId.includes('tweet')) throw new Error('boom')
      return [{ url: 'https://acme.com/blog/a', text: 'x'.repeat(400), crawl: { loadedTime: '2026-06-01T00:00:00Z' }, metadata: { title: 'Post A' } }]
    })
    const { corpus, reports } = await scrapeTargets(
      client,
      [
        { source: 'linkedin', url: 'https://www.linkedin.com/in/nobody/' },
        { source: 'x', url: 'https://x.com/nobody' },
        { source: 'website', url: 'https://acme.com/blog' },
      ],
      { maxPostsPerSource: 10, env: {} },
    )
    expect(reports.map((r) => [r.source, r.posts, r.error])).toEqual([
      ['linkedin', 0, null],
      ['x', 0, 'boom'],
      ['website', 1, null],
    ])
    expect(corpus.posts).toHaveLength(1)
    expect(corpus.posts[0]).toMatchObject({ source: 'website', profileUrl: 'https://acme.com/blog', authorName: 'Post A' })
  })

  it('honours the per-source actor override', () => {
    expect(actorIdFor(tovSourceAdapters.linkedin, {})).toBe('harvestapi/linkedin-profile-posts')
    expect(actorIdFor(tovSourceAdapters.linkedin, { OM_AGENCY_TOV_APIFY_ACTOR_LINKEDIN: 'me/my-actor' })).toBe('me/my-actor')
  })

  it('merges corpora without cross-source id collisions', () => {
    const a = normalizeLinkedInPosts([linkedInItem({ id: 'same' })])
    const b = normalizeGenericPosts([{ id: 'same', text: 'tweet', createdAt: '2026-01-01T00:00:00Z' }], {
      source: 'x',
      fallbackProfileUrl: 'https://x.com/a',
      fields: { id: ['id'], text: ['text'], url: [], postedAt: ['createdAt'], authorName: [], profileUrl: [], likes: [], comments: [], shares: [] },
    })
    expect(mergeCorpora([a, b, a]).posts.map((p) => `${p.source}:${p.id}`)).toEqual(['linkedin:same', 'x:same'])
  })
})
