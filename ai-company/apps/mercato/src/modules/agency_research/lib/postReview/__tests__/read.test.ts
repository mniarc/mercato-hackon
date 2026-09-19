/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { readPostReview } from '../read'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))

const scope = { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002' }
const orderRef = '00000000-0000-4000-8000-000000000003'
const documentId = '00000000-0000-4000-8000-000000000004'
const versionId = '00000000-0000-4000-8000-000000000005'
const em = {} as EntityManager
const findOne = jest.mocked(findOneWithDecryption)
const findMany = jest.mocked(findWithDecryption)
const document = { ...scope, id: documentId, orderRef, templateId: 'WZR-POST', currentVersionId: versionId, status: 'ready_for_review' }
const version = {
  ...scope, id: versionId, documentId, orderRef, templateId: 'WZR-POST', versionNo: 2,
  status: 'ready_for_review', simulationFlag: true, clientViewMd: '# Exact saved post\n\nClient text.',
  data: { privateEvidence: 'Never expose', target: { publication_allowed: true } }, renderedMd: 'Internal evidence',
  approvalRecords: [{ type: 'simulated' }],
}
const qa = {
  id: 'qa-1', status: 'done', outputVersionId: versionId, inputVersions: [],
  qaResult: { verdict: 'pass_for_draft', findings: ['Internal findings'], summary: 'Private summary' },
}

beforeEach(() => {
  jest.clearAllMocks()
  findOne.mockResolvedValueOnce(document as never).mockResolvedValueOnce(version as never)
  findMany.mockResolvedValue([qa] as never)
})

test('projects only the exact scoped client version, simulation state and editorial QA without consent', async () => {
  expect(await readPostReview(em, scope, orderRef, versionId)).toEqual({
    orderRef, documentId, versionId, version: '2.0', templateId: 'WZR-POST', isCurrent: true,
    documentStatus: 'ready_for_review', versionStatus: 'ready_for_review',
    clientViewMd: version.clientViewMd, simulationFlag: true,
    qa: { state: 'assessed', taskRunId: 'qa-1', status: 'done', verdict: 'pass_for_draft' },
  })
  expect(findOne).toHaveBeenNthCalledWith(1, em, AgencyResearchDocument, { ...scope, orderRef, templateId: 'WZR-POST', deletedAt: null }, undefined, scope)
  expect(findOne).toHaveBeenNthCalledWith(2, em, AgencyResearchDocumentVersion, { ...scope, id: versionId, documentId, orderRef, templateId: 'WZR-POST' }, undefined, scope)
  expect(findMany).toHaveBeenCalledWith(em, AgencyResearchTaskRun, { ...scope, orderRef, stepId: '7.3' }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
})

test.each(['document', 'version'])('returns null for a missing or foreign scoped %s', async (missing) => {
  findOne.mockReset()
  if (missing === 'version') findOne.mockResolvedValueOnce(document as never)
  findOne.mockResolvedValueOnce(null)
  expect(await readPostReview(em, scope, orderRef, versionId)).toBeNull()
  expect(findMany).not.toHaveBeenCalled()
})

test('retains historical QA without treating a superseded version as current', async () => {
  findOne.mockReset().mockResolvedValueOnce({ ...document, currentVersionId: 'new-version' } as never).mockResolvedValueOnce({ ...version, simulationFlag: false } as never)
  expect(await readPostReview(em, scope, orderRef, versionId)).toMatchObject({
    versionId, isCurrent: false, simulationFlag: false, qa: { state: 'assessed', verdict: 'pass_for_draft' },
  })
})

test.each([
  ['to_fix', 'needs_fix', 'assessed'],
  ['to_fix', 'reject', 'assessed'],
  ['failed', 'pass_for_draft', 'unavailable'],
  ['to_fix', 'pass_for_draft', 'unavailable'],
])('interprets persisted editorial status %s / %s as %s, not approval', async (status, verdict, state) => {
  findMany.mockResolvedValue([{ ...qa, status, qaResult: { verdict } }] as never)
  expect((await readPostReview(em, scope, orderRef, versionId))?.qa).toEqual(state === 'assessed'
    ? { state, taskRunId: 'qa-1', status, verdict }
    : { state, taskRunId: 'qa-1', status })
})

test('does not use another QA output even when that run read the requested post', async () => {
  findMany.mockResolvedValue([{ ...qa, outputVersionId: 'different-version', inputVersions: [{ document_id: `KLI-POST@${orderRef}`, version: '2.0' }] }] as never)
  expect(await readPostReview(em, scope, orderRef, versionId)).toMatchObject({ qa: { state: 'missing' } })
})

test('a newer failed attempt bound to this post suppresses an older passed editorial review', async () => {
  findMany.mockResolvedValue([
    { ...qa, id: 'qa-newer', status: 'failed', outputVersionId: null, qaResult: null, inputVersions: [{ document_id: `KLI-POST@${orderRef}`, version: '2.0' }] },
    qa,
  ] as never)
  expect(await readPostReview(em, scope, orderRef, versionId)).toMatchObject({ qa: { state: 'unavailable', taskRunId: 'qa-newer', status: 'failed' } })
})

test('does not regenerate missing client content from internal evidence', async () => {
  findOne.mockReset().mockResolvedValueOnce(document as never).mockResolvedValueOnce({ ...version, clientViewMd: null } as never)
  expect(await readPostReview(em, scope, orderRef, versionId)).toMatchObject({ clientViewMd: null })
})
