import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyTovDocument, AgencyTovDocumentVersion, AgencyTovResearchRun } from '../data/entities'
import { readTovDocumentVersion } from '../lib/documentVersion/read'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const scope = { tenantId: '10000000-0000-4000-8000-000000000001', organizationId: '10000000-0000-4000-8000-000000000002' }
const reference = { researchRunId: '10000000-0000-4000-8000-000000000003', versionId: '10000000-0000-4000-8000-000000000004' }
const documentId = '10000000-0000-4000-8000-000000000005'
const otherId = '10000000-0000-4000-8000-000000000006'
const em = {} as EntityManager
const body = {
  brand: 'Brand', summary: 'Original summary', positioning: 'Original positioning', personality: 'Original personality',
  voicePillars: [{ name: 'Direct', description: 'Direct language', doThis: 'Use examples', notThat: 'No jargon' }],
  sharedTraits: [], tensions: [], register: { formality: 2, warmth: 4, confidence: 4, humor: 2, technicality: 3, summary: 'Direct' },
  addressingTheReader: 'You', emotions: 'Calm', boundaries: ['No guarantees'], languagePolicy: 'Polish',
  vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'Low' },
  postFormats: [{ name: 'Lesson', whenToUse: 'After a project', skeleton: 'Context then lesson' }],
  hooks: { patterns: [], examples: [] }, closers: { patterns: [], ctaStyle: 'Soft' },
  formatting: { emoji: 'None', hashtags: 'None', mentions: 'None', links: 'None', capsAndPunctuation: 'Plain' },
  personaVariants: [], doList: [], dontList: [], exemplars: [],
  counterExamples: [{ rule: 'Concrete', wrong: 'Best ever', right: 'This specific result' }], qaChecklist: [], confidence: 0.8,
  retainedProducerAnnotation: 'Do not strip original stored fields',
}
const citations = [{ path: 'exemplars[0]', postId: 'post-1', postRowId: 'source-row', profileUrl: 'https://example.com/profile', url: 'https://example.com/post', quote: 'Original quote' }]

function fixture() {
  const run = { ...scope, id: reference.researchRunId, brand: 'Brand', status: 'done' }
  const version = { ...scope, id: reference.versionId, researchRunId: run.id, documentId, versionNo: 2, body: JSON.stringify(body), renderedMd: '# Original unchanged document\n', citations }
  const document = { ...scope, id: documentId, brand: 'Brand', kind: 'KLI-TOV', deletedAt: null, currentVersionId: version.id }
  const rows = new Map<unknown, Record<string, unknown>>([[AgencyTovResearchRun, run], [AgencyTovDocumentVersion, version], [AgencyTovDocument, document]])
  jest.mocked(findOneWithDecryption).mockImplementation(async (_manager, entity, where) => {
    const row = rows.get(entity)
    return (row && Object.entries(where).every(([key, value]) => row[key] === value) ? row : null) as never
  })
  return { run, version, document }
}

beforeEach(() => jest.clearAllMocks())

it('returns the exact immutable specialist body, render and citations through scoped decrypted reads', async () => {
  fixture()
  await expect(readTovDocumentVersion(em, scope, reference)).resolves.toEqual({
    owner: 'agency_tov', kind: 'KLI-TOV', ...reference, documentId, version: '2.0',
    brand: 'Brand', isCurrent: true, body, renderedMd: '# Original unchanged document\n', citations,
  })
  for (const call of jest.mocked(findOneWithDecryption).mock.calls) {
    expect(call[2]).toEqual(expect.objectContaining(scope))
    expect(call[4]).toEqual(scope)
  }
})

it('reads an explicitly linked historical version without substituting current content', async () => {
  const { document } = fixture()
  document.currentVersionId = otherId
  expect(await readTovDocumentVersion(em, scope, reference)).toEqual(expect.objectContaining({ versionId: reference.versionId, isCurrent: false, body }))
})

it.each(['tenantId', 'organizationId'] as const)('does not expose a version across %s scope', async (field) => {
  fixture()
  await expect(readTovDocumentVersion(em, { ...scope, [field]: otherId }, reference)).resolves.toBeNull()
})

it('does not accept a version belonging to a different research run', async () => {
  const { version } = fixture()
  version.researchRunId = otherId
  await expect(readTovDocumentVersion(em, scope, reference)).resolves.toBeNull()
})

it('does not substitute another version when the requested version is absent', async () => {
  fixture()
  await expect(readTovDocumentVersion(em, scope, { ...reference, versionId: otherId })).resolves.toBeNull()
})

it.each(['running', 'failed'])('does not expose an incomplete %s research run', async (status) => {
  const { run } = fixture()
  run.status = status
  await expect(readTovDocumentVersion(em, scope, reference)).resolves.toBeNull()
})

it('rejects profile documents and deleted brand documents', async () => {
  const { document } = fixture()
  document.kind = 'TOV-PROFILE'
  await expect(readTovDocumentVersion(em, scope, reference)).resolves.toBeNull()
  document.kind = 'KLI-TOV'
  Object.assign(document, { deletedAt: new Date() })
  await expect(readTovDocumentVersion(em, scope, reference)).resolves.toBeNull()
})

it('returns unavailable for malformed scope or reference without querying', async () => {
  fixture()
  await expect(readTovDocumentVersion(em, { ...scope, tenantId: '' }, reference)).resolves.toBeNull()
  await expect(readTovDocumentVersion(em, scope, { ...reference, versionId: '' })).resolves.toBeNull()
  expect(findOneWithDecryption).not.toHaveBeenCalled()
})
