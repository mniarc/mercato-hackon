import { createHash } from 'node:crypto'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { StepInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { createTovWorkflowActivity, AGENCY_TOV_RESULT_CONTEXT_KEY, AGENCY_TOV_WORKFLOW_ID } from '../../tovProcess'
import { STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, STAFF_TOV_INTAKE_CONTEXT_KEY } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const ids = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3), caseId: uuid(4), customerEntityId: uuid(5),
  workflowId: uuid(6), intakeId: uuid(7), attachmentId: uuid(8), stepId: uuid(9), runId: uuid(10), versionId: uuid(11), agentRunId: uuid(12), principalId: uuid(13) }
const posts = [{ id: 'post-1', source: 'linkedin', profileUrl: 'https://example.test/profile', authorName: 'Demo',
  url: 'https://example.test/post', postedAt: '2026-09-19', text: 'Public source text.', likes: 1, comments: 0, shares: 0, media: 'none' }]

const previousExecutionFlag = process.env.AGENCY_TOV_EXECUTION_ENABLED
beforeAll(() => { process.env.AGENCY_TOV_EXECUTION_ENABLED = 'true' })
afterAll(() => {
  if (previousExecutionFlag === undefined) delete process.env.AGENCY_TOV_EXECUTION_ENABLED
  else process.env.AGENCY_TOV_EXECUTION_ENABLED = previousExecutionFlag
})

it.each([undefined, ids.stepId])('uses the native transition context and persisted step identity (optional stepInstanceId=%s)', async (stepInstanceId) => {
  const buffer = Buffer.from(JSON.stringify(posts))
  const result = { researchRunId: ids.runId, documentVersionIds: [ids.versionId], agentRunIds: [ids.agentRunId] }
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => (entity === StepInstance
    ? { id: ids.stepId, stepId: 'tov_research' }
    : { id: ids.caseId, customerEntityId: ids.customerEntityId }) as never)
  const readScoped = jest.fn(async () => ({ buffer }))
  const run = jest.fn(async () => result)
  const services: Record<string, unknown> = { em: {}, attachmentService: { readScoped }, agencyTovResearchService: { run } }
  const container = { resolve: jest.fn((name: string) => services[name]) }
  const intake = { intakeId: ids.intakeId, caseId: ids.caseId, customerEntityId: ids.customerEntityId,
    corpusAttachmentId: ids.attachmentId, corpusSha256: createHash('sha256').update(buffer).digest('hex'),
    initiatedByUserId: ids.userId, eventId: 'staff-event' }
  const context = { userId: ids.principalId, stepInstanceId, workflowContext: {}, workflowInstance: { id: ids.workflowId,
    workflowId: AGENCY_TOV_WORKFLOW_ID,
    currentStepId: 'tov_research',
    metadata: { initiatedBy: ids.userId, entityType: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, entityId: ids.intakeId },
    tenantId: ids.tenantId, organizationId: ids.organizationId, status: 'WAITING_FOR_ACTIVITIES', context: { [STAFF_TOV_INTAKE_CONTEXT_KEY]: intake } } }
  await expect(createTovWorkflowActivity(container as never)({ caseId: ids.caseId,
    process: { kind: 'tone_of_voice', brand: 'Demo', outputLanguage: 'pl' } }, context)).resolves.toEqual(result)
  expect(readScoped).toHaveBeenCalledWith(expect.objectContaining({
    attachmentId: ids.attachmentId,
    auth: { sub: ids.principalId, tenantId: ids.tenantId, orgId: ids.organizationId },
    expectedOwner: { entityId: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, recordId: ids.intakeId },
    expectedAssignment: { type: 'agency_operations:agency_case', id: ids.caseId },
  }))
  expect(context.workflowInstance.context).not.toHaveProperty(AGENCY_TOV_RESULT_CONTEXT_KEY)
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({
    userId: ids.principalId, stepId: 'tov_research', invocationId: ids.stepId,
  }) }))
  expect(findOneWithDecryption).toHaveBeenCalledWith(expect.anything(), StepInstance, {
    tenantId: ids.tenantId, organizationId: ids.organizationId, workflowInstanceId: ids.workflowId,
    stepId: 'tov_research', branchInstanceId: null, ...(stepInstanceId ? { id: stepInstanceId } : {}),
  }, { orderBy: { enteredAt: 'DESC' } }, { tenantId: ids.tenantId, organizationId: ids.organizationId })

  context.workflowInstance.metadata.initiatedBy = ids.principalId
  await expect(createTovWorkflowActivity(container as never)({ caseId: ids.caseId,
    process: { kind: 'tone_of_voice', brand: 'Demo', outputLanguage: 'pl' } }, context))
    .rejects.toThrow('outside its originating workflow or case scope')
  expect(run).toHaveBeenCalledTimes(1)
  expect(readScoped).toHaveBeenCalledTimes(1)
})
