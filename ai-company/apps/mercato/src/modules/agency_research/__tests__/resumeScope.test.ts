/** @jest-environment node */
import { carryCompetitorEntries, resumedResearchTaskSteps, retainCollectedSourceIds, runResearch } from '../lib/researchService'
import { zrodlaDataSchema, sourceSchema, factSchema, languageSampleSchema } from '../data/schemas/zrodla'
import type { CollectedSource } from '../lib/research/fetch'

jest.mock('@open-mercato/web-research', () => ({ assertPublicUrl: jest.fn() }))

test('initial analysis recovery includes in-flight QA repairs but never later phase producers', () => {
  const steps = resumedResearchTaskSteps('3.8', '4.2')
  expect(steps).toEqual(expect.arrayContaining(['3.2', '3.4', '3.7', '3.8', '4.1', '4.2']))
  expect(steps.some((step) => /^[5-9]\./.test(step))).toBe(false)
  expect(resumedResearchTaskSteps('4.2', '4.2')).toEqual(['4.1', '4.2'])
})

test('explicit later CLI ranges retain only their own groups', () => {
  expect(resumedResearchTaskSteps('5.4', '7.3')).toEqual(['5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.5', '6.7', '7.1', '7.2', '7.3'])
})

test('retired whole-pipeline ToV production fails before any earlier work or spending', async () => {
  const runAgent = jest.fn()
  const em = { flush: jest.fn(), findOne: jest.fn() }
  await expect(runResearch({ through: '5.4', runAgent, em } as never)).rejects.toThrow('competing ToV writer is retired')
  expect(runAgent).not.toHaveBeenCalled()
  expect(em.flush).not.toHaveBeenCalled()
  expect(em.findOne).not.toHaveBeenCalled()
})

test('a new private client source cannot take an old competitor ID during source repair', () => {
  const source = (id: string, url: string, publisher: string, privateFile = false) => sourceSchema.parse({
    source_id: id, canonical_source_id: id, independent_material_id: url, url_or_file: url, publisher,
    kind: 'evidence', title: null, retrieved_at: '2026-09-19T12:00:00Z', published_at: null,
    access: 'full', read_scope: 'actual text', limitation: null, source_visibility: privateFile ? 'client_private' : 'public',
    duplicate_of: null, origin: privateFile ? 'client' : 'agent',
  })
  const client = source('S-01', 'https://client.example/about', 'Client')
  const competitor = source('S-02', 'https://competitor.example/about', 'Competitor')
  const privateFile = source('S-02', 'attachment://private-file', 'Client', true)
  const fact = (id: string, entity: string, sourceId: string) => factSchema.parse({ fact_id: id, entity,
    claim: `${entity} claim`, source_ids: [sourceId], locator: { source_id: sourceId, quote: `${entity} quote`, char_offset: 0 },
    paraphrase: `${entity} claim`, kind: 'first_party_claim', use_scope: ['internal'], limitation: null })
  const sample = (sourceId: string, excerpt: string) => languageSampleSchema.parse({ sample_id: 'L02', source_id: sourceId,
    canonical_source_id: sourceId, independent_material_id: sourceId, excerpt_or_paraphrase: excerpt, channel: 'WWW',
    suggested_audience: null, situation: null, linguistic_features: [], observed_function: null, sample_limit: 'one actual source' })
  const empty = zrodlaDataSchema.parse({ sources: [], facts: [], proof_cards: [], language_samples: [], audience_signals: [], content_bank: [], conflicts: [], coverage: [] })
  const previous = { ...empty, sources: [client, competitor], facts: [fact('F01', 'Client', 'S-01'), fact('C01', 'Competitor', 'S-02')], language_samples: [sample('S-02', 'Competitor quote')] }
  const collected: CollectedSource[] = [client, privateFile].map((row) => ({
    source_id: row.source_id, url: row.url_or_file, publisher: row.publisher, kind: row.kind, channel: 'file',
    origin: row.origin, source_visibility: row.source_visibility, access: row.access, title: row.title,
    text: 'Client quote', bytes: 12, retrieved_at: row.retrieved_at, published_at: null, read_scope: row.read_scope, limitation: null,
  }))
  const stable = retainCollectedSourceIds(collected, previous)
  expect(stable.map((row) => row.source_id)).toEqual(['S-01', 'S-03'])
  const fresh = { ...empty, sources: [client, { ...privateFile, source_id: stable[1].source_id, canonical_source_id: stable[1].source_id }],
    facts: [fact('F01', 'Client', 'S-03')], language_samples: [sample('S-03', 'Client quote')] }
  const carried = carryCompetitorEntries(fresh, previous)
  expect(carried.facts.find((row) => row.fact_id === 'C01')).toEqual(previous.facts[1])
  expect(carried.sources.find((row) => row.source_id === 'S-02')).toEqual(competitor)
  expect(carried.sources.find((row) => row.source_id === 'S-03')?.source_visibility).toBe('client_private')
  expect(carried.language_samples).toEqual(expect.arrayContaining([
    expect.objectContaining({ sample_id: 'L02', source_id: 'S-02', excerpt_or_paraphrase: 'Competitor quote' }),
    expect.objectContaining({ sample_id: 'L03', source_id: 'S-03', excerpt_or_paraphrase: 'Client quote' }),
  ]))
  expect(zrodlaDataSchema.safeParse(carried).success).toBe(true)
})
