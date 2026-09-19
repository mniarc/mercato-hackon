/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { buildPublicationConfig, contentApprovalCheck, contentHashOf } from '../../research/publication'
import { readPostAcceptance } from '../../postAcceptance/read'
import { recordPublicationConsent } from '../record'
import { readPublicationConsent, publicationConsentCheckOf } from '../read'
import type { RecordPublicationConsentInput } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../postAcceptance/read', () => ({ readPostAcceptance: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input: RecordPublicationConsentInput = { context: { ...scope, userId: uuid(3) }, request: {
  orderRef: 'case', documentId: uuid(4), versionId: uuid(5), customerUserId: uuid(6), consent: true, decidedAt: '2026-09-19T12:30:00.000Z',
  destination: { configVersionId: uuid(11), platform: 'LinkedIn', accountId: 'account-1', channelId: null, displayName: 'Known account' },
  source: { submissionId: uuid(7), eventId: 'post-review:original', workflowInstanceId: uuid(8), agentRunId: uuid(9), invitationTaskId: uuid(10) },
} }
let document: AgencyResearchDocument, post: AgencyResearchDocumentVersion, config: AgencyResearchDocumentVersion
const flush = jest.fn()
const em = { flush, transactional: (fn: (tx: EntityManager) => Promise<unknown>) => fn(em as unknown as EntityManager) } as unknown as EntityManager
const read = () => readPublicationConsent(em, scope, { orderRef: 'case', postVersionId: uuid(5) })
beforeEach(() => {
  jest.clearAllMocks()
  const base = { ...scope, orderRef: 'case', deletedAt: null }
  document = Object.assign(new AgencyResearchDocument(), { ...base, id: uuid(4), templateId: 'WZR-POST', currentVersionId: uuid(5), status: 'approved' })
  post = Object.assign(new AgencyResearchDocumentVersion(), { ...base, id: uuid(5), documentId: uuid(4), templateId: 'WZR-POST', versionNo: 1,
    data: { text: 'Exact approved text.', links_and_mentions: [] }, approvalRecords: [] })
  const configDocument = Object.assign(new AgencyResearchDocument(), { ...base, id: uuid(12), templateId: 'WZR-KONFIG-PUBLIKACJI', currentVersionId: uuid(11) })
  const data = buildPublicationConfig({ order: { brand: 'Known account', officialSocialPlatform: 'LinkedIn', officialSocialUrl: 'https://linkedin.com/company/example' } }, 'en').data
  data.destination_identity.account_or_workspace_id_or_null = 'account-1'
  data.destination_identity.display_name = 'Known account'
  config = Object.assign(new AgencyResearchDocumentVersion(), { ...base, id: uuid(11), documentId: uuid(12), templateId: 'WZR-KONFIG-PUBLIKACJI', data })
  const brief = Object.assign(new AgencyResearchDocument(), { ...base, id: uuid(13), templateId: 'WZR-BRIEF' })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const rows = entity === AgencyResearchDocument ? [document, configDocument, brief] : [post, config]
    return (rows.find((row) => Object.entries(where as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(readPostAcceptance).mockResolvedValue({ status: 'ready', orderRef: 'case', post: { version: '1.0', documentStatus: 'approved', versionStatus: 'approved' }, receipt: {
    person: input.request.customerUserId, source: { kind: 'agency_post_acceptance', ...input.request.source },
  } } as never)
})

test('records a distinct exact version/target/source receipt once, reuses it and never treats it as content approval', async () => {
  expect(await read()).toMatchObject({ state: 'missing', record: null, target: input.request.destination })
  const result = await recordPublicationConsent(em, input)
  expect(result).toMatchObject({ status: 'recorded', replayed: false, record: { scope: 'post_publication', at: input.request.decidedAt,
    documentVersionId: uuid(5), source: { kind: 'agency_publication_consent', invitationTaskId: uuid(10) } } })
  expect(await recordPublicationConsent(em, input)).toEqual({ ...result, replayed: true })
  expect(await read()).toMatchObject({ state: 'valid', record: { destination: input.request.destination } })
  expect(contentApprovalCheck({ documentId: uuid(4), version: '1.0', status: 'approved', isCurrent: true, approvalRecords: post.approvalRecords as never })).toMatchObject({ state: 'missing' })
  expect(flush).toHaveBeenCalledTimes(1)
  for (const call of jest.mocked(findOneWithDecryption).mock.calls) expect(call[2]).toMatchObject({ ...scope, orderRef: 'case' })
})

test('changed destination, bytes or version make a saved receipt inapplicable without changing its history', async () => {
  const original = await recordPublicationConsent(em, input)
  const data = config.data as { destination_identity: { account_or_workspace_id_or_null: string | null } }
  data.destination_identity.account_or_workspace_id_or_null = 'different-account'
  expect(await read()).toMatchObject({ state: 'stale' })
  expect(await recordPublicationConsent(em, { ...input, request: { ...input.request, source: { ...input.request.source, submissionId: uuid(20) } } })).toMatchObject({ status: 'not_ready', reason: 'target_changed' })
  data.destination_identity.account_or_workspace_id_or_null = 'account-1'
  post.data = { ...(post.data as Record<string, unknown>), text: 'Changed bytes' }
  expect(await read()).toMatchObject({ state: 'stale' })
  post.data = { ...(post.data as Record<string, unknown>), text: 'Exact approved text.' }
  document.currentVersionId = uuid(21)
  expect(await read()).toMatchObject({ state: 'stale' })
  expect(await recordPublicationConsent(em, input)).toEqual({ ...original, replayed: true })
})

test('a profile URL supplies no destination, and another scope/actor/source cannot record or reuse consent', async () => {
  const data = config.data as { destination_identity: { account_or_workspace_id_or_null: string | null } }
  data.destination_identity.account_or_workspace_id_or_null = null
  expect(await read()).toMatchObject({ target: null, state: 'missing' })
  expect(await recordPublicationConsent(em, input)).toMatchObject({ status: 'not_ready', reason: 'target_changed' })
  data.destination_identity.account_or_workspace_id_or_null = 'account-1'
  await recordPublicationConsent(em, input)
  await expect(recordPublicationConsent(em, { ...input, context: { ...input.context, tenantId: uuid(25) } })).rejects.toMatchObject({ status: 404 })
  await expect(recordPublicationConsent(em, { ...input, request: { ...input.request, customerUserId: uuid(25) } })).rejects.toMatchObject({ status: 409 })
  await expect(recordPublicationConsent(em, { ...input, request: { ...input.request, source: { ...input.request.source, invitationTaskId: uuid(25) } } })).rejects.toMatchObject({ status: 409 })
  expect(flush).toHaveBeenCalledTimes(1)
})

function separateInput() {
  return { ...input, request: { ...input.request,
    expectedContentHash: contentHashOf({ text: 'Exact approved text.', links_and_mentions: [] }),
    source: { kind: 'native_publication_consent_task' as const, invitationTaskId: uuid(41), workflowInstanceId: uuid(42), eventId: 'later-original-consent' },
  } }
}

test('later native consent has independent real task provenance without rewriting prior content approval', async () => {
  const later = separateInput()
  const result = await recordPublicationConsent(em, later)
  expect(result).toMatchObject({ status: 'recorded', replayed: false, record: { source: later.request.source } })
  expect(await recordPublicationConsent(em, later)).toEqual({ ...result, replayed: true })
  const consent = await read()
  expect(consent).toMatchObject({ state: 'valid', contentHash: later.request.expectedContentHash })
  expect(publicationConsentCheckOf(consent).consent_ref_or_null).toBe(`${uuid(5)}:publication:task:${uuid(41)}`)
  expect(post.approvalRecords).toHaveLength(1)
  expect(flush).toHaveBeenCalledTimes(1)
})

test('separate consent still needs genuine prior customer approval and exact invited bytes', async () => {
  const later = separateInput()
  expect(await recordPublicationConsent(em, { ...later, request: { ...later.request, expectedContentHash: 'changed-content' } }))
    .toEqual({ status: 'not_ready', reason: 'content_changed' })
  jest.mocked(readPostAcceptance).mockResolvedValueOnce({ status: 'ready', receipt: null } as never)
  expect(await recordPublicationConsent(em, later)).toEqual({ status: 'not_ready', reason: 'content_approval_missing' })
  expect(await recordPublicationConsent(em, { ...later, request: { ...later.request, customerUserId: uuid(43) } }))
    .toEqual({ status: 'not_ready', reason: 'content_approval_missing' })
  expect(flush).not.toHaveBeenCalled()
})

test('a retained receipt on an unapproved current version blocks fresh consent but not immutable receipt replay', async () => {
  const later = separateInput()
  const saved = await recordPublicationConsent(em, later)
  jest.mocked(readPostAcceptance).mockResolvedValue({ status: 'ready', orderRef: 'case',
    post: { version: '1.0', documentStatus: 'approved', versionStatus: 'ready_for_review' },
    receipt: { person: input.request.customerUserId },
  } as never)
  expect(await recordPublicationConsent(em, later)).toEqual({ ...saved, replayed: true })
  expect(await recordPublicationConsent(em, { ...later, request: { ...later.request,
    source: { ...later.request.source, invitationTaskId: uuid(44) },
  } })).toEqual({ status: 'not_ready', reason: 'content_approval_missing' })
  expect(flush).toHaveBeenCalledTimes(1)
})
