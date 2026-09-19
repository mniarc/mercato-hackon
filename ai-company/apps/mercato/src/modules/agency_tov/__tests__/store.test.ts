import type { EntityManager } from '@mikro-orm/postgresql'
import { AgencyTovResearchRun, type AgencyTovPost } from '../data/entities'
import type { TovPost } from '../data/validators'
import { citationsOf, postRowToTovPost, startResearchRun, type PostRowRef } from '../lib/store'
import { linkResolverFor, renderProfileVoice } from '../lib/tov/render'
import { profileMetaFor } from '../lib/corpus'

const profileUrl = 'https://www.linkedin.com/in/a/'

const post = (id: string, text: string): TovPost => ({
  id,
  source: 'linkedin',
  profileUrl,
  authorName: 'A',
  url: `https://www.linkedin.com/posts/a_${id}`,
  postedAt: '2026-01-01T00:00:00.000Z',
  text,
  likes: 0,
  comments: 0,
  shares: 0,
  media: 'none',
})

const posts = [
  post('1001', 'Większość nigdy nie przebije sufitu. Nie z braku talentu, ale z braku jaj do dokonania wyboru.'),
  post('1002', 'Ideas are not proprietary, execution is. That is the foundation of everything we build here.'),
]

const rows = new Map<string, PostRowRef>([
  ['1001', { id: 'row-1', url: posts[0].url, profileUrl }],
  ['1002', { id: 'row-2', url: posts[1].url, profileUrl }],
])
const rowOf = (postId: string) => rows.get(postId) ?? null

describe('startResearchRun', () => {
  it.each([
    { runner: 'orchestrator', models: null, stored: {} },
    { runner: 'orchestrator', models: undefined, stored: {} },
    { runner: 'direct', models: { batch: 'configured-batch', brand: 'configured-brand' },
      stored: { batch: 'configured-batch', brand: 'configured-brand' } },
  ])('persists a non-null direct-model snapshot for $runner ($models)', async ({ runner, models, stored }) => {
    const create = jest.fn((_entity: unknown, input: object) => Object.assign(new AgencyTovResearchRun(), input))
    const persist = jest.fn()
    const flush = jest.fn(async () => undefined)
    const em = { create, persist, flush } as unknown as EntityManager
    const scope = { tenantId: 'tenant', organizationId: 'organization' }
    const run = await startResearchRun(em, scope, {
      brand: 'Demo', outputLanguage: 'pl', runner, models,
      corpus: { posts, rowIds: ['row-1', 'row-2'], sources: [], rowOf },
    })
    expect(run.models).toEqual(stored)
    expect(create).toHaveBeenCalledWith(AgencyTovResearchRun, expect.objectContaining({ ...scope, runner, models: stored, status: 'running' }))
    expect(persist).toHaveBeenCalledWith(run)
    expect(flush).toHaveBeenCalledTimes(1)
  })
})

describe('citationsOf', () => {
  it('resolves exemplars by cited id and hook examples by verbatim match, skipping what has no stored row', () => {
    const citations = citationsOf(
      {
        exemplars: [
          { postId: '1002', quote: 'Ideas are not proprietary, execution is' },
          { postId: '9999', quote: 'not stored anywhere' },
        ],
        hooks: { examples: ['Większość nigdy nie przebije sufitu', 'a hook nobody wrote in any post here'] },
      },
      posts,
      rowOf,
    )
    expect(citations).toEqual([
      { path: 'exemplars[0]', postId: '1002', postRowId: 'row-2', profileUrl, url: posts[1].url, quote: 'Ideas are not proprietary, execution is' },
      { path: 'hooks.examples[0]', postId: '1001', postRowId: 'row-1', profileUrl, url: posts[0].url, quote: 'Większość nigdy nie przebije sufitu' },
    ])
  })
})

describe('postRowToTovPost', () => {
  it('round-trips a stored row into the shape the pipeline reads, citing the platform id', () => {
    const row = {
      id: 'row-1',
      externalId: '1001',
      url: posts[0].url,
      authorName: 'A',
      postedAt: new Date('2026-01-01T00:00:00.000Z'),
      text: posts[0].text,
      likes: 3,
      comments: 1,
      shares: 0,
      media: 'image',
    } as AgencyTovPost
    const tovPost = postRowToTovPost(row, { source: 'linkedin', profileUrl })
    expect(tovPost).toEqual({ ...posts[0], likes: 3, comments: 1, media: 'image' })
    expect(profileMetaFor(profileUrl, [tovPost]).displayName).toBe('A')
  })
})

describe('render links', () => {
  it('links a citation to the post itself when the corpus is known, and to the feed otherwise', () => {
    const voice = {
      summary: 's',
      voicePillars: [],
      register: { formality: 3, warmth: 4, confidence: 5, humor: 2, technicality: 3, summary: 'r' },
      pointOfView: 'first person',
      rhythm: { typicalPostLength: 'medium' as const, sentenceLength: 'short', paragraphing: 'short', listsAndLineBreaks: 'dashes' },
      hooks: { patterns: [], examples: [] },
      structures: [],
      postSkeletons: [],
      closers: { patterns: [], ctaStyle: 'soft' },
      vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'mid' },
      themes: { topics: [], stances: [], values: [] },
      evolution: 'none',
      engagementInsights: [],
      doList: [],
      dontList: [],
      exemplars: [{ postId: '1002', quote: 'Ideas are not proprietary', whyTypical: 'typical' }],
      confidence: 0.9,
    }
    const meta = profileMetaFor(profileUrl, posts)
    expect(renderProfileVoice(meta, voice, linkResolverFor(posts))).toContain(`> — ${posts[1].url}`)
    expect(renderProfileVoice(meta, voice)).toContain('recent-activity/all/ (post 1002)')
  })
})
