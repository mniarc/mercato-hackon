/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, StepInstance, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../../data/entities'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from '../../analysisProcess/workflow'
import { SOURCE_RESPONSE_KEY, SOURCE_RESPONSE_STEP } from '../contracts'
import { readCompletedSourceCorrection } from '../recovery'
import { createSourceClarificationResponseActivity } from '../response'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const em = {} as EntityManager
let workflow: WorkflowInstance, agencyCase: AgencyCase, task: UserTask, submission: AgencyClientSubmission
const submit = jest.fn()
const container = { resolve: (key: string) => key === 'em' ? em : { submit } } as unknown as AppContainer
beforeEach(() => {
  jest.clearAllMocks()
  agencyCase = Object.assign(new AgencyCase(), { ...scope, id: id(3), workflowInstanceId: id(4),
    submittedByCustomerUserId: id(5), customerEntityId: id(6) })
  task = Object.assign(new UserTask(), { ...scope, id: id(7), stepInstanceId: id(8),
    workflowInstanceId: id(4), status: 'COMPLETED', assignedTo: id(5), completedBy: id(5), assigneeKind: 'customer',
    formData: { sourceUrl: 'https://correct.test', sourceNote: 'The old address changed.' } })
  submission = Object.assign(new AgencyClientSubmission(), { ...scope, id: id(9), caseId: id(3),
    original: { text: 'https://correct.test\nThe old address changed.' } })
  workflow = Object.assign(new WorkflowInstance(), { ...scope, id: id(4), workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    status: 'COMPLETED', currentStepId: SOURCE_RESPONSE_STEP, context: {
      [AGENCY_ANALYSIS_RESULT_KEY]: { result: { caseId: id(3), requestedThrough: '3.8', state: 'waiting',
        taskRunIds: ['source-run'], documentVersionIds: [], agentRunIds: [], spentPln: 0, completedThrough: null,
        sourceClarification: { reason: 'insufficient_source_evidence', sourceIds: ['S01'] } } },
      [SOURCE_RESPONSE_KEY]: { result: { state: 'received', taskId: id(7), submissionId: id(9), websiteUrl: 'https://correct.test' } },
    } })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => {
    if (entity === AgencyCase) return agencyCase as never
    if (entity === WorkflowInstance) return workflow as never
    if (entity === UserTask) return task as never
    if (entity === StepInstance) return { id: id(8) } as never
    if (entity === AgencyClientSubmission) return submission as never
    return null
  })
  submit.mockResolvedValue({ item: { submissionId: id(9) }, replayed: false })
})

test('completed source correction is bound to its exact assigned task and saved G original', async () => {
  await expect(readCompletedSourceCorrection(em, scope, agencyCase, workflow)).resolves.toEqual({
    workflowInstanceId: id(4), taskId: id(7), submissionId: id(9), websiteUrl: 'https://correct.test',
  })
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, UserTask, expect.objectContaining({
    ...scope, assignedTo: id(5), completedBy: id(5), status: 'COMPLETED',
  }), undefined, scope)
  submission.original.text = 'a different customer answer'
  await expect(readCompletedSourceCorrection(em, scope, agencyCase, workflow)).resolves.toBeNull()
})

test('pending, unrelated or rejected clarification is not restart authority', async () => {
  workflow.status = 'PAUSED'
  await expect(readCompletedSourceCorrection(em, scope, agencyCase, workflow)).resolves.toBeNull()
  workflow.status = 'COMPLETED'; workflow.currentStepId = 'completed'
  await expect(readCompletedSourceCorrection(em, scope, agencyCase, workflow)).resolves.toBeNull()
  workflow.currentStepId = SOURCE_RESPONSE_STEP
  workflow.context[SOURCE_RESPONSE_KEY] = { result: { state: 'needs_correction', taskId: id(7), submissionId: id(9), websiteUrl: null } }
  await expect(readCompletedSourceCorrection(em, scope, agencyCase, workflow)).resolves.toBeNull()
  expect(findOneWithDecryption).not.toHaveBeenCalled()
})

test('source reply uses real shared intake with a stable event, without approving or running research', async () => {
  await expect(createSourceClarificationResponseActivity(container)({}, { workflowInstance: workflow })).resolves.toMatchObject({
    state: 'received', submissionId: id(9), taskId: id(7), websiteUrl: 'https://correct.test',
  })
  expect(submit).toHaveBeenCalledWith({ ...scope, customerEntityId: id(6), customerUserId: id(5) }, id(3), {
    eventId: `source-clarification:${id(7)}`, text: 'https://correct.test\nThe old address changed.',
  })
})

test('an unclear source answer remains saved and asks again instead of breaking the completed task', async () => {
  task.formData = { sourceUrl: 'I do not know the correct URL' }
  await expect(createSourceClarificationResponseActivity(container)({}, { workflowInstance: workflow })).resolves.toMatchObject({
    state: 'needs_correction', websiteUrl: null, submissionId: id(9),
  })
  expect(submit).toHaveBeenCalledTimes(1)
})
