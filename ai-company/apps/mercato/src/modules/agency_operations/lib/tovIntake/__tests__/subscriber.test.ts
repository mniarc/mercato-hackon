import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import onTovSpecialistCompleted from '../../../subscribers/tov-specialist-completed'
import { AGENCY_TOV_WORKFLOW_ID } from '../../tovProcess'
import { STAFF_TOV_COMPLETION_HANDLER, STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, STAFF_TOV_INTAKE_CONTEXT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const uuid = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, '0')}`

it('hands one exact completed specialist workflow to the continuation boundary', async () => {
  const ids = { workflowInstanceId: uuid(1), tenantId: uuid(2), organizationId: uuid(3), intakeId: uuid(4),
    caseId: uuid(5), customerEntityId: uuid(6), attachmentId: uuid(7), userId: uuid(8) }
  jest.mocked(findOneWithDecryption).mockResolvedValue({
    id: ids.workflowInstanceId, metadata: { entityType: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID },
    context: { [STAFF_TOV_INTAKE_CONTEXT_KEY]: { intakeId: ids.intakeId, caseId: ids.caseId,
      customerEntityId: ids.customerEntityId, corpusAttachmentId: ids.attachmentId, corpusSha256: 'a'.repeat(64),
      initiatedByUserId: ids.userId, eventId: 'staff-event' } },
  } as never)
  const complete = jest.fn(async () => undefined)
  const context = { resolve: jest.fn((name: string) => name === STAFF_TOV_COMPLETION_HANDLER ? { complete } : {}) }
  await onTovSpecialistCompleted({ id: ids.workflowInstanceId, ...ids, workflowId: AGENCY_TOV_WORKFLOW_ID, status: 'COMPLETED' }, context as never)
  expect(complete).toHaveBeenCalledWith({ tenantId: ids.tenantId, organizationId: ids.organizationId,
    caseId: ids.caseId, specialistWorkflowInstanceId: ids.workflowInstanceId })
})
