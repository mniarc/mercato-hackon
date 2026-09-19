/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readBriefAcceptance } from '../read'
import { AgencyResearchDocumentVersion } from '../../../data/entities'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const orderRef = uuid(3), documentId = uuid(4), versionId = uuid(5)
const source = { kind: 'agency_brief_acceptance', submissionId: uuid(6), eventId: 'original-event', workflowInstanceId: uuid(7), agentRunId: uuid(8), invitationTaskId: uuid(9) }
const saved = { person: uuid(10), at: '2026-09-19T10:00:00.000Z', scope: 'brief', version: '2.0', documentVersionId: versionId, source }
const em = {} as EntityManager
const findOne = jest.mocked(findOneWithDecryption)

beforeEach(() => {
  findOne.mockReset()
  findOne.mockResolvedValueOnce({ id: documentId, currentVersionId: uuid(20), status: 'draft' } as never)
    .mockResolvedValueOnce({ id: versionId, versionNo: 2, status: 'approved', approvalRecords: [saved] } as never)
})

test('returns a typed exact historical receipt without treating a newer draft as accepted', async () => {
  expect(await readBriefAcceptance(em, scope, orderRef, versionId)).toEqual({
    status: 'accepted', orderRef, documentId, versionId, version: '2.0', acceptedAt: saved.at, customerUserId: saved.person, source,
  })
  expect(findOne).toHaveBeenNthCalledWith(2, em, AgencyResearchDocumentVersion,
    { ...scope, id: versionId, documentId, orderRef, templateId: 'WZR-BRIEF' }, undefined, scope)
})

test.each([
  { approvalRecords: [] },
  { approvalRecords: [{ ...saved, source: undefined }] },
  { approvalRecords: [{ ...saved, documentVersionId: uuid(30) }] },
  { approvalRecords: [{ ...saved, version: '1.0' }] },
])('approved status cannot replace matching durable decision history: %p', async ({ approvalRecords }) => {
  findOne.mockReset().mockResolvedValueOnce({ id: documentId } as never)
    .mockResolvedValueOnce({ id: versionId, versionNo: 2, status: 'approved', approvalRecords } as never)
  expect(await readBriefAcceptance(em, scope, orderRef, versionId)).toBeNull()
})

test('unaccepted or unavailable exact versions have no acceptance receipt', async () => {
  findOne.mockReset().mockResolvedValueOnce({ id: documentId } as never)
    .mockResolvedValueOnce({ id: versionId, versionNo: 2, status: 'draft', approvalRecords: [saved] } as never)
  expect(await readBriefAcceptance(em, scope, orderRef, versionId)).toBeNull()
  findOne.mockReset().mockResolvedValue(null)
  expect(await readBriefAcceptance(em, scope, orderRef, versionId)).toBeNull()
})
