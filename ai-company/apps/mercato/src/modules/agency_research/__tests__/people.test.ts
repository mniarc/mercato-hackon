import { discoverPeople, gateChannels, gatePeople, personQueries, vetPersonHits } from '../lib/research/steps/people'
import type { CollectedSource } from '../lib/research/fetch'
import type { StepFn } from '../lib/research/pipeline'
import { peopleAgents } from '../lib/agents/people'
import { RESEARCH_CHANNEL_SELECTOR_AGENT_ID, RESEARCH_PEOPLE_FINDER_AGENT_ID } from '../lib/agents/ids.people'
import { parseSpokespeople } from '../../agency_operations/lib/orderBootstrap/analysisLaunch'

const order = { brand: 'Acme', websiteUrl: 'https://acme.example', market: 'Polska', language: 'pl', outputLanguage: 'pl' as const, officialSocialUrl: null, officialSocialPlatform: null, purchaseGoal: null, sku: 'X', topics: 12 }
const page = { source_id: 'S-02', url: 'https://acme.example/o-nas', publisher: 'Acme', excerpt: 'O nas. Firmę prowadzi Anna Kowalska, założycielka i CEO. Wdrożeniami kieruje Jan Nowak.' }

describe('3.2a — people who speak for the brand', () => {
  it('gates the finder: a person needs a verbatim quote from the page, or the client naming them', () => {
    const gated = gatePeople({
      people: [
        { name: 'Anna Kowalska', role: 'CEO', why: 'founder', evidence_quote: 'Firmę prowadzi Anna Kowalska, założycielka i CEO', source_id: 'S-02', confidence: 0.9 },
        { name: 'Piotr Zmyślony', role: 'CTO', why: 'made up', evidence_quote: 'Piotr Zmyślony kieruje technologią', source_id: 'S-02', confidence: 0.8 },
        { name: 'Jan Nowak', role: 'wdrożenia', why: 'leads delivery', evidence_quote: 'Wdrożeniami kieruje Jan Nowak', source_id: 'S-02', confidence: 0.6 },
      ],
      notes: '',
    }, [page], [{ name: 'Maria Lis', role: 'CMO', provided_by: 'client', knownUrls: [] }], 4)
    expect(gated.value.people.map((p) => p.name)).toEqual(['Maria Lis', 'Anna Kowalska', 'Jan Nowak'])
    expect(gated.issues.map((i) => i.code)).toContain('PERSON_NOT_IN_PAGES')
    expect(gated.value.people[0].confidence).toBe(1)
  })

  it('caps the people followed and drops duplicates', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `Osoba ${i}`, role: 'r', why: 'w', evidence_quote: 'provided by client', source_id: null, confidence: 0.5 }))
    const gated = gatePeople({ people: [...many, many[0]], notes: '' }, [], many.map((p) => ({ name: p.name, role: null, provided_by: 'client' as const, knownUrls: [] })), 4)
    expect(gated.value.people).toHaveLength(4)
    expect(gated.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['DUPLICATE_PERSON', 'LIMIT_TRUNCATED']))
  })

  it('vets search hits: no directories, no client site, no duplicates; queries are code', () => {
    const hits = [
      { query: 'q', url: 'https://www.linkedin.com/in/anna-kowalska/', title: null, snippet: null },
      { query: 'q', url: 'https://linkedin.com/in/anna-kowalska', title: null, snippet: null },
      { query: 'q', url: 'https://acme.example/team', title: null, snippet: null },
      { query: 'q', url: 'https://www.rocketreach.co/anna-kowalska', title: null, snippet: null },
      { query: 'q', url: 'https://media.example/wywiad', title: null, snippet: null },
    ]
    expect(vetPersonHits(hits, order.websiteUrl).map((h) => h.url)).toEqual(['https://www.linkedin.com/in/anna-kowalska/', 'https://media.example/wywiad'])
    expect(personQueries('Anna Kowalska', order)).toEqual(['"Anna Kowalska" Acme', '"Anna Kowalska" linkedin', '"Anna Kowalska" wywiad OR podcast OR rozmowa'])
  })

  it('gates the selector: every channel and mention must be a real hit', () => {
    const hits = [{ query: 'q', url: 'https://www.linkedin.com/in/anna-kowalska/', title: null, snippet: null }, { query: 'q', url: 'https://media.example/wywiad', title: null, snippet: null }]
    const gated = gateChannels({
      own_channels: [{ url: 'https://linkedin.com/in/anna-kowalska', platform: 'linkedin', why: 'her profile', confidence: 0.9 }, { url: 'https://x.com/annak', platform: 'x', why: 'guessed', confidence: 0.4 }],
      mentions: [{ url: 'https://media.example/wywiad', kind: 'interview', why: 'interview', confidence: 0.8 }],
      not_this_person: [],
    }, hits)
    expect(gated.value.own_channels.map((c) => c.url)).toEqual(['https://www.linkedin.com/in/anna-kowalska/'])
    expect(gated.value.mentions).toHaveLength(1)
    expect(gated.issues.map((i) => i.code)).toEqual(['URL_NOT_FROM_SEARCH'])
  })

  it('runs end to end over fakes: finder → search → selector → scrape + fetch → sources of the register', async () => {
    const collected: CollectedSource[] = [{ source_id: 'S-01', url: 'https://acme.example/o-nas', publisher: 'Acme', kind: 'oficjalna strona', channel: 'WWW', origin: 'purchase_form', access: 'full', title: 'O nas', text: page.excerpt, bytes: 80, retrieved_at: 't', published_at: null, read_scope: 's', limitation: null }]
    const step: StepFn = (async ({ agentId, gate }: { agentId: string; gate: (v: unknown) => unknown }) => {
      if (agentId === RESEARCH_PEOPLE_FINDER_AGENT_ID) return gate({ people: [{ name: 'Anna Kowalska', role: 'CEO', why: 'founder', evidence_quote: 'Firmę prowadzi Anna Kowalska, założycielka i CEO', source_id: 'S-01', confidence: 0.9 }], notes: '' })
      if (agentId === RESEARCH_CHANNEL_SELECTOR_AGENT_ID) return gate({ own_channels: [{ url: 'https://www.linkedin.com/in/anna-kowalska/', platform: 'linkedin', why: 'profile', confidence: 0.9 }], mentions: [{ url: 'https://media.example/wywiad', kind: 'interview', why: 'interview', confidence: 0.8 }], not_this_person: [] })
      throw new Error(`unexpected agent ${agentId}`)
    }) as unknown as StepFn
    const result = await discoverPeople({
      order,
      collected,
      knownPeople: [],
      searchWeb: async () => [{ url: 'https://www.linkedin.com/in/anna-kowalska/', title: 'Anna Kowalska – CEO – Acme', snippet: null }, { url: 'https://media.example/wywiad', title: 'Wywiad', snippet: null }],
      fetchPage: async (url) => ({ url, finalUrl: url, status: 'ok', title: 'Wywiad z Anną Kowalską', markdown: 'Rozmawiamy z założycielką Acme o tym, jak skraca wdrożenia. Anna Kowalska: "Zaczynamy od diagnozy, nie od specyfikacji."', error: null }),
      scrapeProfilePosts: async () => [
        { id: '1', url: 'https://www.linkedin.com/posts/1', text: 'Trzy rzeczy, które psują wdrożenia B2B. Po pierwsze specyfikacja pisana bez użytkowników.', postedAt: '2026-09-01', authorName: 'Anna Kowalska', likes: 40, comments: 5, shares: 2 },
        { id: '2', url: 'https://www.linkedin.com/posts/2', text: 'Dziś o tym, dlaczego zaczynamy od diagnozy.', postedAt: '2026-08-01', authorName: 'Anna Kowalska', likes: 4, comments: 0, shares: 0 },
      ],
      step,
    })
    expect(result.people).toHaveLength(1)
    expect(result.people[0]).toMatchObject({ name: 'Anna Kowalska', provided_by: 'pages', evidence_source_id: 'S-01' })
    expect(result.people[0].own_channels[0]).toMatchObject({ platform: 'linkedin', posts: 2 })
    expect(result.people[0].mentions[0]).toMatchObject({ kind: 'interview', source_id: 'S-04' })
    expect(result.sources.map((s) => `${s.source_id} ${s.publisher} ${s.kind}`)).toEqual([
      'S-02 Anna Kowalska wpis osoby wypowiadającej się w imieniu marki',
      'S-03 Anna Kowalska wpis osoby wypowiadającej się w imieniu marki',
      'S-04 Anna Kowalska — interview (media.example) wypowiedź osoby u strony trzeciej (interview)',
    ])
    expect(result.sources[0].text).toContain('Trzy rzeczy')
    expect(result.stats).toMatchObject({ candidates: 1, followed: 1, searches: 3, scraped_posts: 2, fetched_pages: 1 })
  })

  it('registers two extract-tier agents that only choose among what they are given', () => {
    expect(peopleAgents.map((a) => a.id)).toEqual([RESEARCH_PEOPLE_FINDER_AGENT_ID, RESEARCH_CHANNEL_SELECTOR_AGENT_ID])
    const selector = peopleAgents[1] as unknown as { systemPrompt: string; allowedTools?: string[] }
    expect(selector.systemPrompt).toMatch(/Każdy url musi być dokładnie jednym z adresów hits/)
    expect(selector.allowedTools ?? []).toEqual([])
  })

  it('parses the order form lines into people, always including the buyer contact', () => {
    expect(parseSpokespeople('Anna Kowalska, CEO, https://www.linkedin.com/in/anna-kowalska/\nJan Nowak – Head of Delivery\n\nAnna Kowalska https://x.com/annak', 'Rafał Muda')).toEqual([
      { name: 'Anna Kowalska', role: 'CEO', knownUrls: ['https://www.linkedin.com/in/anna-kowalska/', 'https://x.com/annak'] },
      { name: 'Jan Nowak', role: 'Head of Delivery', knownUrls: [] },
      { name: 'Rafał Muda', role: null, knownUrls: [] },
    ])
  })
})
