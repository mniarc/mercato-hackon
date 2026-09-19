/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { readBriefReview } from '../read'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))

const scope = { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002' }
const orderRef = '00000000-0000-4000-8000-000000000003'
const documentId = '00000000-0000-4000-8000-000000000004'
const versionId = '00000000-0000-4000-8000-000000000005'
const em = {} as EntityManager
const findOne = jest.mocked(findOneWithDecryption)
const findMany = jest.mocked(findWithDecryption)

const document = { ...scope, id: documentId, orderRef, templateId: 'WZR-BRIEF', currentVersionId: versionId, status: 'ready_for_review' }
const version = {
  ...scope, id: versionId, documentId, orderRef, templateId: 'WZR-BRIEF', versionNo: 2,
  status: 'draft', clientViewMd: '# Saved client brief',
  inputVersions: [{ document_id: `WEW-USTALENIA@${orderRef}`, version: '3.0' }],
  data: { privateEvidence: 'never expose' }, renderedMd: 'Internal markdown',
}
const qa = { id: 'qa-1', status: 'done', outputVersionId: versionId, inputVersions: [], qaResult: { verdict: 'ready_for_approval', findings: ['Internal QA detail'], summary: 'Private summary' } }

beforeEach(() => {
  jest.clearAllMocks()
  findOne.mockResolvedValueOnce(document as never).mockResolvedValueOnce(version as never).mockResolvedValue(null)
  findMany.mockResolvedValue([qa] as never)
})

test('reads exact scoped brief and exposes only the client content plus typed QA evidence', async () => {
  const result = await readBriefReview(em, scope, orderRef, versionId)
  expect(result).toEqual({
    orderRef, documentId, versionId, version: '2.0', templateId: 'WZR-BRIEF', isCurrent: true,
    documentStatus: 'ready_for_review', versionStatus: 'draft', clientViewMd: '# Saved client brief', questions: [],
    qa: { state: 'assessed', taskRunId: 'qa-1', status: 'done', verdict: 'ready_for_approval' },
  })
  expect(findOne).toHaveBeenNthCalledWith(1, em, AgencyResearchDocument, { ...scope, orderRef, templateId: 'WZR-BRIEF', deletedAt: null }, undefined, scope)
  expect(findOne).toHaveBeenNthCalledWith(2, em, AgencyResearchDocumentVersion, { ...scope, id: versionId, documentId, orderRef, templateId: 'WZR-BRIEF' }, undefined, scope)
  expect(findMany).toHaveBeenCalledWith(em, AgencyResearchTaskRun, { ...scope, orderRef, stepId: '4.2' }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
})

test.each(['document', 'version'])('returns null when the scoped %s is missing', async (missing) => {
  findOne.mockReset()
  if (missing === 'version') findOne.mockResolvedValueOnce(document as never)
  findOne.mockResolvedValueOnce(null)
  expect(await readBriefReview(em, scope, orderRef, versionId)).toBeNull()
  expect(findMany).not.toHaveBeenCalled()
})

test('keeps stale-version currentness separate from its historical clean QA', async () => {
  findOne.mockReset().mockResolvedValueOnce({ ...document, currentVersionId: 'new-version' } as never).mockResolvedValueOnce(version as never).mockResolvedValue(null)
  expect(await readBriefReview(em, scope, orderRef, versionId)).toMatchObject({ isCurrent: false, qa: { state: 'assessed', verdict: 'ready_for_approval' } })
})

test.each([
  ['done', 'needs_client_data', 'assessed'],
  ['to_fix', 'needs_agent_fix', 'assessed'],
  ['failed', 'ready_for_approval', 'unavailable'],
  ['running', 'ready_for_approval', 'unavailable'],
  ['paused_budget', 'ready_for_approval', 'unavailable'],
  ['to_fix', 'ready_for_approval', 'unavailable'],
  ['done', 'unknown', 'unavailable'],
])('QA status %s with verdict %s is %s without inferring approval', async (status, verdict, state) => {
  findMany.mockResolvedValue([{ ...qa, status, qaResult: { verdict } }] as never)
  const result = await readBriefReview(em, scope, orderRef, versionId)
  expect(result?.qa).toEqual(state === 'assessed'
    ? { state, taskRunId: 'qa-1', status, verdict }
    : { state, taskRunId: 'qa-1', status })
})

test('ignores QA bound to another output and does not promote a document status without QA', async () => {
  findMany.mockResolvedValue([{ ...qa, outputVersionId: 'different-version', inputVersions: [{ document_id: `KLI-BRIEF@${orderRef}`, version: '2.0' }] }] as never)
  expect(await readBriefReview(em, scope, orderRef, versionId)).toMatchObject({ qa: { state: 'missing' } })
})

test('a newer failed attempt with exact input binding suppresses earlier clean QA', async () => {
  findMany.mockResolvedValue([
    { ...qa, id: 'newer', status: 'failed', outputVersionId: null, qaResult: null, inputVersions: [{ document_id: `KLI-BRIEF@${orderRef}`, version: '2.0' }] },
    qa,
  ] as never)
  expect(await readBriefReview(em, scope, orderRef, versionId)).toMatchObject({ qa: { state: 'unavailable', taskRunId: 'newer', status: 'failed' } })
})

test('reads questions from the brief-pinned findings version, never current findings or internal QA', async () => {
  const question = { question_id: 'q1', question: 'Who is the audience?', hint: 'Describe the buyer.', reason: 'Targeting', brief_field: 'priority_audience', priority: 'must', if_unanswered: 'Wait', state: 'open', options: [{ variant_id: 'a', label: 'A', text: 'A', fact_ids: ['internal'] }] }
  findOne.mockReset().mockResolvedValueOnce(document as never).mockResolvedValueOnce(version as never).mockResolvedValueOnce({ data: { questions: [question, { ...question, question_id: 'resolved', state: 'resolved_by_client' }], field_map: [], evidence_requests: [], readiness: [], research_return: [] } } as never)
  const result = await readBriefReview(em, scope, orderRef, versionId)
  expect(findOne).toHaveBeenNthCalledWith(3, em, AgencyResearchDocumentVersion, { ...scope, orderRef, templateId: 'WZR-USTALENIA', versionNo: 3 }, undefined, scope)
  expect(result?.questions).toEqual([{ question_id: 'q1', question: 'Who is the audience?', hint: 'Describe the buyer.', reason: 'Targeting', brief_field: 'priority_audience', priority: 'must' }])
})

test('missing stored client content remains unavailable rather than regenerated from internal data', async () => {
  findOne.mockReset().mockResolvedValueOnce(document as never).mockResolvedValueOnce({ ...version, clientViewMd: null } as never).mockResolvedValue(null)
  expect(await readBriefReview(em, scope, orderRef, versionId)).toMatchObject({ clientViewMd: null })
})
