import type { TovBatchObservation, TovPost } from '../data/validators'
import { groundBrandVoice, groundObservation, GroundingError, quoteIsVerbatim } from '../lib/tov/grounding'

const post = (id: string, text: string, profileUrl = 'https://www.linkedin.com/in/a/'): TovPost => ({
  id,
  source: 'linkedin',
  profileUrl,
  authorName: 'A',
  url: `https://example.com/${id}`,
  postedAt: '2026-01-01T00:00:00.000Z',
  text,
  likes: 0,
  comments: 0,
  shares: 0,
  media: 'none',
})

const posts = [
  post('1', 'Większość nigdy nie przebije sufitu. Nie z braku talentu, ale z braku jaj do dokonania wyboru.\n\nPraca z młodymi ludźmi daje mi perspektywę.'),
  post('2', '“Ideas aren’t proprietary, execution is”. To fundament filozofii budowania, którą przekazuję w książce.'),
]

const observation = (overrides: Partial<TovBatchObservation>): TovBatchObservation => ({
  language: { primary: 'pl', notes: 'Polish' },
  register: { formality: 3, warmth: 4, confidence: 5, humor: 2, technicality: 3, summary: 's' },
  pointOfView: 'first person',
  rhythm: { typicalPostLength: 'medium', sentenceLength: 'short', paragraphing: 'short', listsAndLineBreaks: 'dash lists' },
  hooks: { patterns: ['contrarian'], examples: [] },
  structures: [],
  closers: { patterns: [], ctaStyle: 'soft' },
  vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'mid' },
  formatting: { emoji: 'rare', hashtags: 'none', mentions: 'names', links: 'comments', capsAndPunctuation: 'plain' },
  themes: { topics: [], stances: [], values: [] },
  engagementInsights: [],
  doList: [],
  dontList: [],
  exemplars: [],
  confidence: 0.8,
  ...overrides,
})

describe('quoteIsVerbatim', () => {
  it('ignores case, whitespace and typographic quotes', () => {
    expect(quoteIsVerbatim('"ideas aren\'t proprietary,   execution is"', posts[1].text)).toBe(true)
  })
  it('accepts elided quotes when every substantial fragment is present', () => {
    expect(quoteIsVerbatim('Większość nigdy nie przebije sufitu… z braku jaj do dokonania wyboru.', posts[0].text)).toBe(true)
  })
  it('accepts honestly stitched quotes (joined paragraphs, dropped labels or emoji)', () => {
    const stitched = 'Ideas aren’t proprietary, execution is. To fundament filozofii budowania, którą przekazuję w książce.'
    expect(quoteIsVerbatim(stitched, posts[1].text)).toBe(true)
  })
  it('rejects paraphrases and quotes with no substantial fragment', () => {
    expect(quoteIsVerbatim('Most people never break through the ceiling.', posts[0].text)).toBe(false)
    expect(quoteIsVerbatim('Wybór jednej ścieżki jest trudny, ale kluczowy dla sukcesu.', posts[0].text)).toBe(false)
    expect(quoteIsVerbatim('Nie…', posts[0].text)).toBe(false)
  })
  it('repairs a truncated id to the unique post it prefixes, and never guesses between two', () => {
    const many = [post('7325562000000000001', 'Martwicie się, że AI zmiecie Software Housy z rynku.'), post('7325562000000000002', 'Jest 9 rano, spotykacie się w salce w Warszawie.')]
    const grounded = groundObservation(
      observation({ exemplars: [{ postId: '7325562000000', quote: 'Martwicie się, że AI zmiecie Software Housy z rynku.', whyTypical: 'x' }] }),
      [many[0], posts[0]],
    )
    expect(grounded.value.exemplars[0].postId).toBe('7325562000000000001')
    expect(grounded.repairs).toEqual([{ path: 'exemplars[0]', from: '7325562000000', to: '7325562000000000001' }])
    expect(() =>
      groundObservation(observation({ exemplars: [{ postId: '7325562000000', quote: 'Martwicie się, że AI zmiecie Software Housy z rynku.', whyTypical: 'x' }] }), many),
    ).toThrow(GroundingError)
  })
})

describe('groundObservation', () => {
  it('drops exemplars pointing at unknown posts or paraphrased quotes and reports why', () => {
    const grounded = groundObservation(
      observation({
        exemplars: [
          { postId: '1', quote: 'Większość nigdy nie przebije sufitu.', whyTypical: 'ok' },
          { postId: '999', quote: 'Większość nigdy nie przebije sufitu.', whyTypical: 'invented id' },
          { postId: '2', quote: 'Ideas are not owned by anyone, only execution matters.', whyTypical: 'paraphrase' },
        ],
        hooks: { patterns: ['x'], examples: ['Większość nigdy nie przebije sufitu.', 'Nikt nie kupi tego produktu.'] },
      }),
      posts,
    )
    expect(grounded.value.exemplars.map((e) => e.postId)).toEqual(['1'])
    expect(grounded.value.hooks.examples).toEqual(['Większość nigdy nie przebije sufitu.'])
    expect(grounded.issues.map((i) => i.reason)).toEqual(['unknown_post', 'quote_not_verbatim', 'hook_not_in_corpus'])
    expect(grounded).toMatchObject({ kept: 1, dropped: 3 })
  })

  it('rejects a result with no grounded exemplar at all', () => {
    expect(() =>
      groundObservation(observation({ exemplars: [{ postId: 'nope', quote: 'Większość nigdy nie przebije sufitu.', whyTypical: 'x' }] }), posts),
    ).toThrow(GroundingError)
  })
})

describe('groundBrandVoice', () => {
  it('requires the cited profile to own the post', () => {
    const brand = {
      brand: 'B',
      summary: 's',
      positioning: 'p',
      personality: 'p',
      voicePillars: [{ name: 'n', description: 'd', doThis: 'a', notThat: 'b' }],
      sharedTraits: [],
      tensions: [],
      register: { formality: 3, warmth: 4, confidence: 5, humor: 2, technicality: 3, summary: 's' },
      addressingTheReader: 'you',
      emotions: 'calm',
      boundaries: [],
      languagePolicy: 'pl',
      vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'mid' },
      postFormats: [{ name: 'f', whenToUse: 'w', skeleton: 's' }],
      hooks: { patterns: [], examples: [] },
      closers: { patterns: [], ctaStyle: 'soft' },
      formatting: { emoji: 'rare', hashtags: 'none', mentions: 'names', links: 'comments', capsAndPunctuation: 'plain' },
      personaVariants: [],
      doList: [],
      dontList: [],
      exemplars: [
        { postId: '1', profileUrl: 'https://www.linkedin.com/in/a/', quote: 'Większość nigdy nie przebije sufitu.', whyItWorks: 'ok' },
        { postId: '1', profileUrl: 'https://www.linkedin.com/in/b/', quote: 'Większość nigdy nie przebije sufitu.', whyItWorks: 'wrong owner' },
      ],
      counterExamples: [{ rule: 'r', wrong: 'w', right: 'r' }],
      qaChecklist: [],
      confidence: 0.7,
    }
    const grounded = groundBrandVoice(brand, posts)
    expect(grounded.value.exemplars).toHaveLength(1)
    expect(grounded.issues).toEqual([{ path: 'exemplars[1]', reason: 'wrong_profile', postId: '1' }])
  })
})
