/** @jest-environment node */
import { collectSources, type FetchPage } from '../../fetch'
import { proofSourceVisibility, runSourcesStep } from '../sources'
import { createLedger } from '../../ledger'
import { GateError } from '../../gate'
import type { OrderFacts } from '../../../../data/schemas/zamowienie'
import type { ResearchMaterialSource } from '../../../contracts/agencyResearch'
import { limits } from '../../../../data/templates'

const order: OrderFacts = { brand: 'Client', websiteUrl: 'https://example.test', market: 'PL', language: 'pl', outputLanguage: 'pl', officialSocialUrl: null, officialSocialPlatform: null, purchaseGoal: null, sku: 'test', topics: 1 }
const material: ResearchMaterialSource = { attachmentId: '30000000-0000-4000-8000-000000000001', submissionId: '40000000-0000-4000-8000-000000000001', fileName: 'evidence.txt', text: 'Our private source contains a precise, attributable statement.', submittedAt: '2026-09-19T10:00:00.000Z' }
const unavailable: FetchPage = async (url) => ({ url, finalUrl: url, status: 'unavailable', title: null, markdown: null, error: 'not available' })

it('adds real extracted text to the existing source collection without fetching private attachments', async () => {
  const fetchPage = jest.fn(unavailable)
  const sources = await collectSources(order, { fetchPage, materialSources: [material, material] })
  expect(fetchPage).toHaveBeenCalledTimes(limits.research.fetchAttemptsPerUrl)
  expect(fetchPage).toHaveBeenCalledWith(order.websiteUrl)
  expect(sources).toHaveLength(2)
  expect(sources[1]).toMatchObject({ url: `attachment://${material.attachmentId}`, origin: 'client', source_visibility: 'client_private', access: 'full', text: material.text, title: material.fileName })
  expect(sources[1].read_scope).toContain(material.submissionId)
  expect(sources[1].read_scope).toContain(material.submittedAt)
  // Stop at the existing runner boundary: prove bytes-derived text is supplied,
  // without pretending that a fixture approved or generated research findings.
  const stop = new GateError('test stops at agent input', [])
  const runAgent = jest.fn(async () => { throw stop })
  await expect(runSourcesStep({ order, sources, runAgent, ledger: createLedger(), models: { extract: 'mistralai/mistral-nemo', synthesis: 'mistralai/mistral-nemo', qa: 'mistralai/mistral-nemo' } })).rejects.toBe(stop)
  expect(runAgent).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ page: expect.objectContaining({ url: `attachment://${material.attachmentId}`, content_md: material.text, origin: 'client' }) }), expect.any(Object))
})

it('records missing native extraction as unavailable rather than treating metadata as content', async () => {
  const sources = await collectSources(order, { fetchPage: unavailable, materialSources: [{ ...material, text: null }] })
  expect(sources[1]).toMatchObject({ access: 'unavailable', text: null, bytes: 0, source_visibility: 'client_private', limitation: 'native attachment text extraction unavailable' })
  expect(sources[1].read_scope).toContain('not read')
})

it('applies the existing shared order text cap to uploaded material', async () => {
  const text = 'x'.repeat(limits.research.maxTotalChars + 50)
  const sources = await collectSources(order, { fetchPage: unavailable, materialSources: [{ ...material, text }] })
  expect(sources[1].text).toHaveLength(limits.research.maxTotalChars)
  expect(sources[1]).toMatchObject({ access: 'partial', limitation: 'limited by the order text cap' })
})

it('keeps mixed proof evidence private and never treats unknown evidence as public', () => {
  const sources = [{ source_id: 'S-01', source_visibility: 'public' as const }, { source_id: 'S-02', source_visibility: 'client_private' as const }]
  expect(proofSourceVisibility(['S-01', 'S-02'], sources)).toBe('client_private')
  expect(proofSourceVisibility(['S-01'], sources)).toBe('public')
  expect(proofSourceVisibility(['S-01', 'missing'], sources)).toBe('unknown')
})
