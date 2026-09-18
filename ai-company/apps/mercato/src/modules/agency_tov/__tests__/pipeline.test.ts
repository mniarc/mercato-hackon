import {
  TOV_BATCH_ANALYST_AGENT_ID,
  TOV_BRAND_SYNTHESIZER_AGENT_ID,
  TOV_PROFILE_SYNTHESIZER_AGENT_ID,
  TOV_SOURCE_SCOUT_AGENT_ID,
  aiAgents,
} from '../ai-agents'
import {
  tovBatchAnalystInputSchema,
  tovBrandSynthesizerInputSchema,
  tovProfileSynthesizerInputSchema,
  type TovBatchObservation,
  type TovBrandVoice,
  type TovPost,
  type TovProfileVoice,
} from '../data/validators'
import { batchPosts, mapWithConcurrency } from '../lib/tov/batch'
import { runTovPipeline, type TovPipelineCache } from '../lib/tov/pipeline'
import { renderBrandTov, renderProfileVoice } from '../lib/tov/render'

const post = (id: string, profileUrl: string, text: string, postedAt = '2026-01-01T00:00:00.000Z'): TovPost => ({
  id,
  source: 'linkedin',
  profileUrl,
  authorName: profileUrl.split('/').filter(Boolean).pop() ?? 'x',
  url: `https://example.com/${id}`,
  postedAt,
  text: `We shipped it. ${text}`,
  likes: 1,
  comments: 0,
  shares: 0,
  media: 'none',
})

const register = { formality: 2, warmth: 4, confidence: 4, humor: 2, technicality: 3, summary: 'direct and warm' }
const observation = (postId: string): TovBatchObservation => ({
  language: { primary: 'en', notes: 'English' },
  register,
  pointOfView: 'first person',
  rhythm: { typicalPostLength: 'short', sentenceLength: 'short', paragraphing: 'one-liners', listsAndLineBreaks: 'rare' },
  hooks: { patterns: ['question'], examples: ['Why?'] },
  structures: ['claim → example'],
  closers: { patterns: ['question'], ctaStyle: 'soft' },
  vocabulary: { signaturePhrases: ['ship it'], favouredWords: ['ship'], avoided: ['synergy'], jargonLevel: 'low' },
  formatting: { emoji: 'none', hashtags: 'none', mentions: 'rare', links: 'rare', capsAndPunctuation: 'plain' },
  themes: { topics: ['shipping'], stances: ['bias to action'], values: ['honesty'] },
  engagementInsights: ['questions get comments'],
  doList: ['be short'],
  dontList: ['no buzzwords'],
  exemplars: [{ postId, quote: 'We shipped it.', whyTypical: 'short and declarative' }],
  confidence: 0.8,
})
const profileVoice = (postId = 'a1'): TovProfileVoice => ({
  ...observation(postId),
  summary: 'A builder voice',
  voicePillars: [{ name: 'Builder', description: 'ships', evidence: ['ship it'] }],
  evolution: 'stable',
  postSkeletons: ['hook → lesson'],
  exemplars: [{ postId, quote: 'We shipped it.', whyTypical: 'typical' }],
})
const brandVoice = (brand: string, profileUrl: string): TovBrandVoice => ({
  brand,
  summary: 'sum',
  positioning: 'pos',
  personality: 'a builder',
  voicePillars: [{ name: 'Builder', description: 'd', doThis: 'do', notThat: 'not' }],
  sharedTraits: ['short'],
  tensions: ['none'],
  register,
  addressingTheReader: 'you',
  emotions: 'calm',
  boundaries: ['no politics'],
  languagePolicy: 'English',
  vocabulary: { signaturePhrases: ['ship it'], favouredWords: ['ship'], avoided: ['synergy'], jargonLevel: 'low' },
  postFormats: [{ name: 'Lesson', whenToUse: 'after a launch', skeleton: 'hook\nlesson\nquestion' }],
  hooks: { patterns: ['question'], examples: ['Why?'] },
  closers: { patterns: ['question'], ctaStyle: 'soft' },
  formatting: { emoji: 'none', hashtags: 'none', mentions: 'rare', links: 'rare', capsAndPunctuation: 'plain' },
  personaVariants: [{ profileUrl, displayName: 'a', howTheyDiffer: 'x', whenToWriteAsThem: 'y' }],
  doList: ['be short'],
  dontList: ['no buzzwords'],
  exemplars: [{ postId: 'a1', profileUrl, quote: 'We shipped it.', whyItWorks: 'short' }],
  counterExamples: [{ rule: 'short', wrong: 'We are thrilled to announce…', right: 'We shipped it.' }],
  qaChecklist: ['Is it short?'],
  confidence: 0.7,
})

describe('batchPosts', () => {
  it('bounds batches by count and by characters, never splitting a post', () => {
    const posts = [post('1', 'a', 'x'.repeat(50)), post('2', 'a', 'x'.repeat(50)), post('3', 'a', 'x'.repeat(50)), post('4', 'a', 'x'.repeat(500))]
    expect(batchPosts(posts, { batchSize: 2, maxBatchChars: 1000 }).map((b) => b.posts.map((p) => p.id))).toEqual([['1', '2'], ['3', '4']])
    expect(batchPosts(posts, { batchSize: 10, maxBatchChars: 150 }).map((b) => b.posts.map((p) => p.id))).toEqual([['1', '2'], ['3'], ['4']])
    expect(batchPosts([], {})).toEqual([])
  })
})

describe('mapWithConcurrency', () => {
  it('keeps order and never exceeds the limit', async () => {
    let inFlight = 0
    let peak = 0
    const results = await mapWithConcurrency([30, 10, 20], 2, async (delay, index) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, delay))
      inFlight -= 1
      return index
    })
    expect(results).toEqual([0, 1, 2])
    expect(peak).toBe(2)
  })
})

describe('runTovPipeline', () => {
  const a = 'https://www.linkedin.com/in/a/'
  const b = 'https://www.linkedin.com/in/b/'
  const posts = [
    post('a1', a, 'first', '2026-01-01T00:00:00.000Z'),
    post('a2', a, 'second', '2026-02-01T00:00:00.000Z'),
    post('a3', a, 'third', '2026-03-01T00:00:00.000Z'),
    post('b1', b, 'other', '2026-01-15T00:00:00.000Z'),
  ]

  it('maps batches per profile, reduces per profile, then per brand, validating every step', async () => {
    const calls: { agentId: string; input: unknown }[] = []
    const result = await runTovPipeline({
      posts,
      brand: 'Acme',
      outputLanguage: 'en',
      batchSize: 2,
      concurrency: 2,
      runAgent: async (agentId, input) => {
        calls.push({ agentId, input })
        if (agentId === TOV_BATCH_ANALYST_AGENT_ID) {
          const parsed = tovBatchAnalystInputSchema.parse(input)
          return { kind: 'research', data: observation(parsed.posts[0].id) }
        }
        if (agentId === TOV_PROFILE_SYNTHESIZER_AGENT_ID) {
          const parsed = tovProfileSynthesizerInputSchema.parse(input)
          return { kind: 'research', data: profileVoice(parsed.profile.profileUrl === a ? 'a1' : 'b1') }
        }
        const parsed = tovBrandSynthesizerInputSchema.parse(input)
        return { kind: 'research', data: brandVoice(parsed.brand, parsed.profiles[0].profile.profileUrl) }
      },
    })

    const batchCalls = calls.filter((c) => c.agentId === TOV_BATCH_ANALYST_AGENT_ID)
    expect(batchCalls).toHaveLength(3)
    expect(calls.filter((c) => c.agentId === TOV_PROFILE_SYNTHESIZER_AGENT_ID)).toHaveLength(2)
    expect(calls.filter((c) => c.agentId === TOV_BRAND_SYNTHESIZER_AGENT_ID)).toHaveLength(1)
    expect(result.stats).toEqual({ posts: 4, profiles: 2, batches: 3, agentCalls: 6, cachedSteps: 0, ungroundedDropped: 6, groundingRejections: 0 })

    const profileA = result.profiles.find((p) => p.profile.profileUrl === a)!
    expect(profileA.batches.map((batch) => batch.postIds)).toEqual([['a1', 'a2'], ['a3']])
    expect(profileA.batches[0].dateRange).toEqual({ from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' })
    expect(result.brand.brand).toBe('Acme')

    const analystInput = tovBatchAnalystInputSchema.parse(batchCalls[0].input)
    expect(Object.keys(analystInput.posts[0]).sort()).toEqual(['comments', 'id', 'likes', 'media', 'postedAt', 'shares', 'text'])
  })

  it('rejects an agent result that does not match the schema', async () => {
    await expect(
      runTovPipeline({ posts: posts.slice(0, 1), brand: 'Acme', outputLanguage: 'en', runAgent: async () => ({ kind: 'research', data: { nope: true } }) }),
    ).rejects.toThrow()
  })

  it('rejects an invented exemplar, re-requests, and fails the run when the retries are exhausted', async () => {
    const events: string[] = []
    const invented = jest.fn(async (agentId: string, input: unknown) => {
      if (agentId !== TOV_BATCH_ANALYST_AGENT_ID) throw new Error('unreachable')
      tovBatchAnalystInputSchema.parse(input)
      return { kind: 'research', data: observation('made-up-id') }
    })
    await expect(
      runTovPipeline({
        posts: posts.slice(0, 1),
        brand: 'Acme',
        outputLanguage: 'en',
        groundingRetries: 1,
        runAgent: invented,
        onEvent: (event) => events.push(event.type),
      }),
    ).rejects.toThrow(/no grounded exemplar/)
    expect(invented).toHaveBeenCalledTimes(2)
    expect(events.filter((e) => e === 'grounding_rejected')).toHaveLength(2)
  })

  it('reuses cached steps so a rerun costs no agent calls', async () => {
    const store = new Map<string, unknown>()
    const cache: TovPipelineCache = { get: async (key) => store.get(key) ?? null, set: async (key, value) => void store.set(key, value) }
    const runAgent = jest.fn(async (agentId: string, input: unknown) => {
      if (agentId === TOV_BATCH_ANALYST_AGENT_ID) return { kind: 'research', data: observation(tovBatchAnalystInputSchema.parse(input).posts[0].id) }
      if (agentId === TOV_PROFILE_SYNTHESIZER_AGENT_ID) {
        return { kind: 'research', data: profileVoice(tovProfileSynthesizerInputSchema.parse(input).profile.profileUrl === a ? 'a1' : 'b1') }
      }
      return { kind: 'research', data: brandVoice('Acme', a) }
    })
    const first = await runTovPipeline({ posts, brand: 'Acme', outputLanguage: 'en', batchSize: 2, runAgent, cache })
    expect(first.stats.agentCalls).toBe(6)
    const second = await runTovPipeline({ posts, brand: 'Acme', outputLanguage: 'en', batchSize: 2, runAgent, cache })
    expect(second.stats).toMatchObject({ agentCalls: 0, cachedSteps: 6 })
    expect(runAgent).toHaveBeenCalledTimes(6)
  })
})

describe('agent definitions', () => {
  it('registers read-only object-mode agents; only the scout may reach the web', () => {
    expect(aiAgents.map((agent) => agent.id)).toEqual([
      TOV_SOURCE_SCOUT_AGENT_ID,
      TOV_BATCH_ANALYST_AGENT_ID,
      TOV_PROFILE_SYNTHESIZER_AGENT_ID,
      TOV_BRAND_SYNTHESIZER_AGENT_ID,
    ])
    for (const agent of aiAgents) {
      expect(agent.executionMode).toBe('object')
      expect(agent.readOnly).toBe(true)
      expect(agent.allowedTools).toEqual(
        agent.id === TOV_SOURCE_SCOUT_AGENT_ID ? ['agent_orchestrator.web_search', 'agent_orchestrator.web_fetch'] : [],
      )
    }
  })
})

describe('renderers', () => {
  it('render the brand document and a profile appendix as markdown', () => {
    const profile = { source: 'linkedin' as const, profileUrl: 'https://www.linkedin.com/in/a/', displayName: 'A', postCount: 3, firstPostedAt: null, lastPostedAt: null }
    const md = renderBrandTov(brandVoice('Acme', profile.profileUrl), [{ profile }])
    expect(md).toContain('# Tone of voice — Acme')
    expect(md).toContain('## Recommended vs not recommended')
    expect(md).toContain('— A, https://www.linkedin.com/in/a/recent-activity/all/ (post a1)')
    expect(renderProfileVoice(profile, profileVoice())).toContain('# Voice profile — A')
  })
})
