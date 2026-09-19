/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'

const findOne = jest.fn()
const findMany = jest.fn()
const nativeEnabled = jest.fn()
jest.mock('../../agents/client-triage/configuration', () => ({
  isClientTriageEnabled: () => nativeEnabled(),
}))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
  findWithDecryption: (...args: unknown[]) => findMany(...args),
}))

import { createClientSubmissionService } from '../clientSubmissionService'
import { CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY, createClientSubmissionWorkflow, deterministicClientTriage } from '../clientSubmissionWorkflow'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../agents/client-triage/workflow'

const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003', customerUserId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const submissionId = '00000000-0000-4000-8000-000000000006'
const workflowId = '00000000-0000-4000-8000-000000000007'
const materialId = '00000000-0000-4000-8000-000000000008'
const foreignId = '00000000-0000-4000-8000-000000000009'
let stored: AgencyClientSubmission | undefined
let workflow: Record<string, unknown> | undefined
let agencyCase: Record<string, unknown>
const customer = jest.fn()
const startWorkflow = jest.fn()
const executeWorkflow = jest.fn()
const hasRegistration = jest.fn()
let inTransaction = false
const em = {
  transactional: async (fn: (tx: unknown) => unknown): Promise<unknown> => {
    const before = stored
    inTransaction = true
    try { return await fn(em) } catch (error) { stored = before; throw error }
    finally { inTransaction = false }
  },
  create: jest.fn((_type, input) => Object.assign(new AgencyClientSubmission(), { id: submissionId, ...input })),
  persist: jest.fn((submission) => { stored = submission }),
  flush: jest.fn(),
}
const container = {
  hasRegistration,
  resolve(key: string) {
    if (key === 'em') return em
    if (key === 'customerUserService') return { findById: customer }
    if (key === 'workflowExecutor') return { startWorkflow, executeWorkflow }
    throw new Error(key)
  },
} as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  stored = undefined
  workflow = undefined
  inTransaction = false
  nativeEnabled.mockReturnValue(false)
  hasRegistration.mockReturnValue(true)
  agencyCase = { id: caseId, ...identity, deletedAt: null, materialAttachmentId: materialId }
  customer.mockResolvedValue({ isActive: true, customerEntityId: identity.customerEntityId })
  findOne.mockImplementation((_em, type, where) => {
    const candidate = type === AgencyCase ? agencyCase : type === AgencyClientSubmission ? stored : workflow
    if (!candidate) return null
    return Object.entries(where).every(([key, value]) => candidate[key as keyof typeof candidate] === value) ? candidate : null
  })
  findMany.mockImplementation(() => stored ? [stored] : [])
  startWorkflow.mockImplementation(async (_em, options) => {
    workflow = { id: workflowId, ...identity, deletedAt: null, context: options.initialContext, currentStepId: 'start', status: 'RUNNING' }
    return { id: workflowId }
  })
  executeWorkflow.mockImplementation(async () => {
    const context = workflow!.context as Record<string, unknown>
    const disposition = deterministicClientTriage(context, { workflowInstance: identity })
    workflow!.context = { ...context, [CLIENT_TRIAGE_RESULT_KEY]: { result: disposition }, privateStaffData: 'must not leak' }
    workflow!.status = disposition.kind === 'answer' ? 'COMPLETED' : 'PAUSED'
    workflow!.currentStepId = disposition.kind === 'answer' ? 'answered' : 'client_reply'
  })
})

it('stores immutable original and replays the same event without creating or classifying again', async () => {
  const service = createClientSubmissionService(container)
  const first = await service.submit(identity, caseId, { eventId: 'client-event-1', text: '  My original words.  ', scaffoldScenario: 'answer' })
  const replay = await service.submit(identity, caseId, { eventId: 'client-event-1', text: 'Replacement must not overwrite', scaffoldScenario: 'clarify' })
  expect(first.replayed).toBe(false)
  expect(replay).toEqual({ item: first.item, replayed: true })
  expect(replay.item.original.text).toBe('  My original words.  ')
  expect(replay.item.disposition).toMatchObject({ kind: 'answer', source: 'deterministic_scaffold', effectsApplied: false })
  expect(replay.item.workflow).toEqual({ status: 'COMPLETED', currentStep: 'answered' })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(startWorkflow.mock.calls[0][1].workflowId).toBe(CLIENT_SUBMISSION_WORKFLOW_ID)
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(startWorkflow.mock.calls[0][1].metadata).not.toHaveProperty('initiatedBy')
  expect(JSON.stringify(replay)).not.toContain('privateStaffData')
})

it('preserves the exact review response as original input without granting approval authority', async () => {
  const service = createClientSubmissionService(container)
  const reviewResponse = {
    taskId: workflowId, channel: 'portal' as const, kind: 'approval' as const,
    documentId: materialId, versionId: foreignId, externalEventId: 'review-event',
    body: 'Accept, but change the ending.',
  }
  const result = await service.submit(identity, caseId, {
    eventId: 'task-review-event', text: reviewResponse.body,
    documentVersionReference: foreignId, reviewResponse,
  })
  expect(result.item.original.reviewResponse).toEqual(reviewResponse)
  expect(stored?.original).toMatchObject({ reviewResponse })
  expect(result.item.disposition).toMatchObject({ effectsApplied: false })
  const replay = await service.submit(identity, caseId, {
    eventId: 'task-review-event', text: 'Replace original',
    reviewResponse: { ...reviewResponse, body: 'Unconditional acceptance' },
  })
  expect(replay.item.original.reviewResponse).toEqual(reviewResponse)
  expect(startWorkflow).toHaveBeenCalledTimes(1)
})

it('dispatches opted-in native triage only after committing its scoped original, and never redispatches a replay', async () => {
  nativeEnabled.mockReturnValue(true)
  executeWorkflow.mockImplementation(async (manager, appContainer, instanceId) => {
    expect(inTransaction).toBe(false)
    expect(manager).toBe(em)
    expect(appContainer).toBe(container)
    expect(instanceId).toBe(workflowId)
    expect(stored).toMatchObject({
      workflowInstanceId: workflowId, tenantId: identity.tenantId, organizationId: identity.organizationId,
      original: { eventId: 'native-1', text: 'Original native submission' },
    })
    workflow!.status = 'PAUSED'
    workflow!.currentStepId = 'triage'
  })
  const service = createClientSubmissionService(container)
  const first = await service.submit(identity, caseId, { eventId: 'native-1', text: 'Original native submission' })
  const replay = await service.submit(identity, caseId, { eventId: 'native-1', text: 'Do not reclassify this replacement' })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({
    workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
    tenantId: identity.tenantId, organizationId: identity.organizationId,
    initialContext: expect.objectContaining({
      tenantId: identity.tenantId, organizationId: identity.organizationId,
      customerEntityId: identity.customerEntityId, caseId, submissionId,
    }),
    metadata: { entityType: 'agency_operations:agency_client_submission', entityId: submissionId },
  }))
  expect(first.item.workflow).toEqual({ status: 'PAUSED', currentStep: 'triage' })
  expect(first.item.disposition).toBeNull()
  expect(replay).toEqual({ item: first.item, replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(hasRegistration).toHaveBeenCalledWith('agentWorkflowBridge')
  expect(startWorkflow.mock.calls[0][1].initialContext).not.toHaveProperty('customerUserId')
})

it('rejects native triage without its native bridge and rolls back the submission', async () => {
  nativeEnabled.mockReturnValue(true)
  hasRegistration.mockReturnValue(false)
  await expect(createClientSubmissionService(container).submit(identity, caseId, {
    eventId: 'native-1', text: 'Original',
  })).rejects.toThrow('Native client triage requires agent_orchestrator')
  expect(stored).toBeUndefined()
  expect(startWorkflow).not.toHaveBeenCalled()
  expect(executeWorkflow).not.toHaveBeenCalled()
})

it.each(['customerEntityId', 'tenantId', 'organizationId'])('denies foreign %s before writing or executing', async (field) => {
  agencyCase[field] = foreignId
  const service = createClientSubmissionService(container)
  await expect(service.submit(identity, caseId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 404 })
  await expect(service.list(identity, caseId)).rejects.toMatchObject({ status: 404 })
  expect(em.persist).not.toHaveBeenCalled()
  expect(startWorkflow).not.toHaveBeenCalled()
})

it('denies an inactive customer and a material not attached to the owned case', async () => {
  const service = createClientSubmissionService(container)
  customer.mockResolvedValueOnce({ isActive: false, customerEntityId: identity.customerEntityId })
  await expect(service.submit(identity, caseId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 403 })
  await expect(service.submit(identity, caseId, { eventId: '1', materialAttachmentId: foreignId })).rejects.toMatchObject({ status: 404 })
  expect(em.persist).not.toHaveBeenCalled()
})

it('projects saved clarification and keeps unsupported intents effect-free in the typed contract', async () => {
  const result = await createClientSubmissionService(container).submit(identity, caseId, { eventId: '2', materialAttachmentId: materialId })
  expect(result.item.disposition).toMatchObject({ kind: 'clarify', effectsApplied: false })
  expect(result.item.workflow?.currentStep).toBe('client_reply')
  for (const kind of ['change', 'approve', 'hold', 'escalate']) {
    expect(clientSubmissionDispositionSchema.parse({ ...result.item.disposition, kind }).effectsApplied).toBe(false)
  }
  const definition = createClientSubmissionWorkflow().definition
  expect(definition.steps.find((step) => step.stepId === 'client_reply')).toMatchObject({ stepType: 'WAIT_FOR_SIGNAL' })
  expect(definition.transitions.find((transition) => transition.transitionId === 'clarify')).toMatchObject({
    condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, value: 'clarify' },
  })
})

it('rejects a triage invocation outside its native workflow scope', () => {
  expect(() => deterministicClientTriage({ ...identity, caseId, submissionId, scaffoldScenario: 'answer' }, {
    workflowInstance: { ...identity, tenantId: foreignId },
  })).toThrow('outside the workflow scope')
})
