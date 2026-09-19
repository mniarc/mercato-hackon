/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { readPostAcceptance } from '../../postAcceptance/read'
import { documentIdFor } from '../../research/envelope'
import { startTaskRun, saveDocumentVersion, finishTaskRun } from '../../store'
import { preparePublication } from '../prepare'
import { buildPublicationConfig, contentHashOf } from '../../research/publication'
import { publicationConsentRecordSchema } from '../../publicationConsent/contracts'
import type { PostData } from '../../../data/schemas/post'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../postAcceptance/read', () => ({ readPostAcceptance: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), saveDocumentVersion: jest.fn(), finishTaskRun: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input = { context: { ...scope, userId: uuid(3) }, request: { orderRef: 'case', postVersionId: uuid(4), acceptanceSubmissionId: uuid(5) } }
const em: EntityManager = { transactional: (work: (manager: EntityManager) => Promise<unknown>) => work(em) } as unknown as EntityManager
let rows: AgencyResearchDocumentVersion[]
let runs: AgencyResearchTaskRun[]
const text = 'This exact client-approved text must not change.'

beforeEach(() => {
  jest.clearAllMocks()
  runs = []
  rows = ['WZR-POST', 'WZR-ZAMOWIENIE', 'WZR-ZLECENIE-POSTU'].map((templateId, i) => Object.assign(new AgencyResearchDocumentVersion(), {
    ...scope, orderRef: 'case', id: i === 0 ? uuid(4) : uuid(10 + i), documentId: uuid(20 + i), templateId, versionNo: 2, status: 'approved', data: {},
  }))
  rows[0].inputVersions = ['WZR-ZAMOWIENIE', 'WZR-ZLECENIE-POSTU'].map((template) => ({ document_id: documentIdFor(template as 'WZR-ZAMOWIENIE', 'case'), version: '2.0' }))
  rows[0].data = { text, target: { channel: 'LinkedIn', language: 'en', market: 'UK', format: 'text', finished_post_count: 1, adapter_id: 'linkedin-company-post-text', adapter_version: '0.1.0', platform_character_limit: 3000, platform_limit_status: 'known', target_account_id: null, publication_status: 'blocked_simulation', publication_allowed: false },
    claims_map: [], links_and_mentions: [], client_note: 'Prepared text.', qa: { review_type: 'editor', status: 'reviewed', is_independent_review: true, independent_editor_review: null, copy_checks: [],
      metrics: { word_count: 8, word_count_rule: 'whitespace', character_count_with_spaces_and_newlines: text.length, character_count_without_whitespace: 40, line_break_count: 0, words_target: [120, 220], within_internal_word_target: false, client_note_word_count: 2, client_note_max_words: 80, platform_character_limit: 3000, platform_limit_compliance: 'within_limit' },
      instruction_alignment: 'pass', factual_scope: 'pass', tone_of_voice: 'pass', format: 'pass', links: 'pass', unsupported_facts_added: 0, additional_sources_used: 0, additional_research_performed: 0, corrections_applied: [], corrections_note: null, evidence_limitations: [], publication_gate: 'blocked', real_approval_recorded: false, author_review_version: '2.0' } }
  rows[1].data = { product_selection: { sku: 'configured', offer_version: '1', price_net: 1, currency: 'PLN' }, brand: { display_name: 'Brand', website_url: 'https://example.test' }, market_language: { market: 'UK', language: 'en' }, official_social: { platform: 'LinkedIn', url: 'https://linkedin.com/company/brand' } }
  rows[2].data = { delivery_constraints: { cta_publication_readiness: 'ready' } }
  jest.mocked(readPostAcceptance).mockResolvedValue({ status: 'ready', orderRef: 'case', post: { documentId: uuid(20), versionId: uuid(4), version: '2.0', documentStatus: 'approved', versionStatus: 'approved' },
    receipt: { person: uuid(30), at: '2026-09-19T06:00:00.000Z', scope: 'post_content', version: '2.0', source: { submissionId: uuid(5) } } } as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const brief = { ...scope, orderRef: 'case', templateId: 'WZR-BRIEF', deletedAt: null }
    const documents = rows.map((row) => ({ ...scope, orderRef: 'case', templateId: row.templateId, id: row.documentId, currentVersionId: row.id, deletedAt: null }))
    const candidates = entity === AgencyResearchDocument ? [brief, ...documents] : rows
    return (candidates.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(startTaskRun).mockImplementation(async (_em, tenantScope, task) => {
    const run = Object.assign(new AgencyResearchTaskRun(), { ...tenantScope, ...task, id: uuid(40), status: 'running' }); runs.push(run); return run
  })
  jest.mocked(saveDocumentVersion).mockImplementation(async (_em, tenantScope, data) => {
    const version = Object.assign(new AgencyResearchDocumentVersion(), { ...tenantScope, ...data, id: uuid(50 + rows.length), versionNo: 1 }); rows.push(version)
    return { version } as never
  })
  jest.mocked(finishTaskRun).mockImplementation(async (_em, run, outcome) => { Object.assign(run, outcome) })
})

test('prepares exact accepted bytes with real content approval, missing publication gates, and stable replay', async () => {
  const prepared = await preparePublication(em, input)
  expect(prepared).toMatchObject({ status: 'prepared', contentApproval: 'valid', publicationConsent: 'missing', canSend: false,
    missingGates: expect.arrayContaining(['publication_consent', 'destination', 'access']), replayed: false })
  const instruction = jest.mocked(saveDocumentVersion).mock.calls.find((call) => call[2].templateId === 'WZR-ZLECENIE-PUBLIKACJI')![2]
  expect(instruction.data).toMatchObject({ payload: { text }, content_approval_check: { state: 'valid' }, publication_consent_check: { state: 'missing' }, execution_guard: { reservation_state: 'none', attempt_refs: [] } })
  expect(await preparePublication(em, input)).toEqual({ ...prepared, replayed: true })
  expect(startTaskRun).toHaveBeenCalledTimes(1)
  expect(jest.mocked(saveDocumentVersion).mock.calls.map((call) => call[2].templateId)).toEqual(['WZR-KONFIG-PUBLIKACJI', 'WZR-ZLECENIE-PUBLIKACJI'])
})
test('superseded acceptance and missing pinned order stop without writes or latest-version substitution', async () => {
  expect(await preparePublication(em, { ...input, request: { ...input.request, acceptanceSubmissionId: uuid(99) } })).toMatchObject({ status: 'not_ready', reason: 'acceptance_superseded' })
  rows[1].versionNo = 3
  expect(await preparePublication(em, input)).toMatchObject({ status: 'not_ready', reason: 'pinned_input_missing' })
  expect(startTaskRun).not.toHaveBeenCalled()
})

test('preparation reuses the exact separate consent without granting send authority or changing the accepted text', async () => {
  const data = buildPublicationConfig({ order: { brand: 'Brand', officialSocialPlatform: 'LinkedIn', officialSocialUrl: 'https://linkedin.com/company/brand' } }, 'en').data
  data.destination_identity.account_or_workspace_id_or_null = 'account-1'
  const config = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: 'case', id: uuid(80), documentId: uuid(81), templateId: 'WZR-KONFIG-PUBLIKACJI', versionNo: 1, status: 'blocked', data })
  rows.push(config)
  rows[0].approvalRecords = [publicationConsentRecordSchema.parse({ person: uuid(30), at: '2026-09-19T06:00:00.000Z', scope: 'post_publication',
    documentId: rows[0].documentId, documentVersionId: rows[0].id, version: '2.0', contentHash: contentHashOf(rows[0].data as PostData),
    destination: { configVersionId: config.id, platform: data.platform.platform, accountId: 'account-1', channelId: null, displayName: 'Brand' },
    source: { kind: 'agency_publication_consent', submissionId: uuid(5), eventId: 'post-review:original', workflowInstanceId: uuid(82), agentRunId: uuid(83), invitationTaskId: uuid(84) },
  })]
  const prepared = await preparePublication(em, input)
  expect(prepared).toMatchObject({ status: 'prepared', publicationConsent: 'valid', contentApproval: 'valid', canSend: false })
  const instruction = jest.mocked(saveDocumentVersion).mock.calls.find((call) => call[2].templateId === 'WZR-ZLECENIE-PUBLIKACJI')![2]
  expect(instruction.data).toMatchObject({ payload: { text }, publication_consent_check: { state: 'valid' }, execution_guard: { reservation_state: 'none', attempt_refs: [] } })
})
