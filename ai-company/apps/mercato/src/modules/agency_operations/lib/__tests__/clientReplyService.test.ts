/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { AgencyClientReply } from '../../data/clientReply'
import { StepInstance, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'

const findOne = jest.fn()
const findMany = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
  findWithDecryption: (...args: unknown[]) => findMany(...args),
}))

import { createClientReplyService } from '../clientReplyService'
import { CLIENT_REPLY_SIGNAL, CLIENT_SUBMISSION_WORKFLOW_ID, CLIENT_TRIAGE_RESULT_KEY, deterministicClientTriage } from '../clientSubmissionWorkflow'
import { NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../../agents/client-triage/workflow'

const identity = {
  tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003', customerUserId: '00000000-0000-4000-8000-000000000004',
}
const caseId = '00000000-0000-4000-8000-000000000005'
const submissionId = '00000000-0000-4000-8000-000000000006'
const workflowId = '00000000-0000-4000-8000-000000000007'
const stepId = '00000000-0000-4000-8000-000000000008'
const replyId = '00000000-0000-4000-8000-000000000009'
const foreignId = '00000000-0000-4000-8000-000000000010'
let stored: AgencyClientReply | undefined
let workflow: Record<string, any>
let submission: Record<string, unknown>
let agencyCase: Record<string, unknown>
const customer = jest.fn()
const sendSignal = jest.fn()
const tx = {
  create: jest.fn((_type, input) => Object.assign(new AgencyClientReply(), { id: replyId, ...input })),
  persist: jest.fn((reply) => { stored = reply }),
  flush: jest.fn(),
}
const em = {
  transactional: jest.fn(async (fn: (manager: typeof tx) => Promise<unknown>): Promise<unknown> => {
    const before = stored
    try { return await fn(tx) } catch (error) { stored = before; throw error }
  }),
}
const container = {
  resolve(key: string) {
    if (key === 'em') return em
    if (key === 'customerUserService') return { findById: customer }
    if (key === 'signalHandler') return { sendSignal }
    throw new Error(key)
  },
} as unknown as AppContainer

function useNativeClarification() {
  workflow.workflowId = NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID
  workflow.context[CLIENT_TRIAGE_RESULT_KEY].result = {
    ...workflow.context[CLIENT_TRIAGE_RESULT_KEY].result,
    source: 'native_agent', workerId: 'agency_operations.client_triage',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  stored = undefined
  agencyCase = { id: caseId, ...identity, deletedAt: null }
  submission = { id: submissionId, caseId, ...identity, deletedAt: null, workflowInstanceId: workflowId }
  workflow = {
    id: workflowId, ...identity, deletedAt: null, workflowId: CLIENT_SUBMISSION_WORKFLOW_ID,
    currentStepId: 'client_reply', status: 'PAUSED',
    context: { caseId, submissionId, [CLIENT_TRIAGE_RESULT_KEY]: { result: deterministicClientTriage({
      ...identity, caseId, submissionId, scaffoldScenario: 'clarify',
    }, { workflowInstance: identity }) } },
  }
  customer.mockResolvedValue({ isActive: true, customerEntityId: identity.customerEntityId })
  findOne.mockImplementation((_manager, type, where) => {
    const candidate = type === AgencyCase ? agencyCase : type === AgencyClientSubmission ? submission
      : type === AgencyClientReply ? stored : type === WorkflowInstance ? workflow
        : type === StepInstance ? { id: stepId, workflowInstanceId: workflowId, stepId: 'client_reply', status: 'ACTIVE', ...identity } : undefined
    if (!candidate) return null
    return Object.entries(where).every(([key, value]) => (candidate as unknown as Record<string, unknown>)[key] === value) ? candidate : null
  })
  findMany.mockImplementation(() => stored ? [stored] : [])
  sendSignal.mockImplementation(async () => { workflow.status = 'COMPLETED'; workflow.currentStepId = 'reply_received' })
})

it('preserves original reply and exact wait evidence, with native continuation in the same transaction', async () => {
  const result = await createClientReplyService(container).reply(identity, caseId, submissionId, { eventId: 'reply-1', text: '  Clarification in my words.  ' })
  expect(result).toMatchObject({ replayed: false, item: {
    replyId, caseId, submissionId, submittedByCustomerUserId: identity.customerUserId,
    original: { eventId: 'reply-1', text: '  Clarification in my words.  ' }, outcome: 'clarification_received',
  } })
  expect(stored).toMatchObject({ workflowInstanceId: workflowId, stepInstanceId: stepId })
  expect(sendSignal).toHaveBeenCalledWith(tx, container, {
    tenantId: identity.tenantId, organizationId: identity.organizationId,
    instanceId: workflowId, signalName: CLIENT_REPLY_SIGNAL,
    payload: { clientClarificationReply: {
      replyId, submissionId, submittedByCustomerUserId: identity.customerUserId,
      receivedAt: result.item.createdAt, channel: 'portal',
    } },
  })
  expect(sendSignal.mock.calls[0][2]).not.toHaveProperty('userId')
})

it('replays the saved result after completion without sending or classifying again', async () => {
  const service = createClientReplyService(container)
  const first = await service.reply(identity, caseId, submissionId, { eventId: 'reply-1', text: 'Original' })
  const replay = await service.reply(identity, caseId, submissionId, { eventId: 'reply-1', text: 'Do not overwrite original' })
  expect(replay).toEqual({ item: first.item, replayed: true })
  expect(sendSignal).toHaveBeenCalledTimes(1)
  expect(await service.list(identity, caseId, submissionId)).toEqual({ items: [first.item] })
  await expect(service.reply(identity, caseId, submissionId, { eventId: 'reply-2', text: 'A stale new event' })).rejects.toMatchObject({ status: 409 })
  expect(sendSignal).toHaveBeenCalledTimes(1)
})

it('continues a saved native clarification through the fixed scoped signal and replays without resuming twice', async () => {
  useNativeClarification()
  const service = createClientReplyService(container)
  const first = await service.reply(identity, caseId, submissionId, { eventId: 'native-reply', text: 'Native clarification' })
  const replay = await service.reply(identity, caseId, submissionId, { eventId: 'native-reply', text: 'Do not overwrite' })
  expect(first.item.outcome).toBe('clarification_received')
  expect(replay).toEqual({ item: first.item, replayed: true })
  expect(stored).toMatchObject({ workflowInstanceId: workflowId, stepInstanceId: stepId })
  expect(sendSignal).toHaveBeenCalledTimes(1)
  expect(sendSignal).toHaveBeenCalledWith(tx, container, {
    tenantId: identity.tenantId, organizationId: identity.organizationId,
    instanceId: workflowId, signalName: CLIENT_REPLY_SIGNAL,
    payload: { clientClarificationReply: {
      replyId, submissionId, submittedByCustomerUserId: identity.customerUserId,
      receivedAt: first.item.createdAt, channel: 'portal',
    } },
  })
})

it.each(['tenantId', 'organizationId'])('rejects a native clarification workflow with foreign %s', async (field) => {
  useNativeClarification()
  workflow[field] = foreignId
  await expect(createClientReplyService(container).reply(identity, caseId, submissionId, {
    eventId: 'native-reply', text: 'Clarification',
  })).rejects.toMatchObject({ status: 409 })
  expect(tx.persist).not.toHaveBeenCalled()
  expect(sendSignal).not.toHaveBeenCalled()
})

it('cannot use a native client reply to resume a human exception or a different saved target', async () => {
  useNativeClarification()
  const service = createClientReplyService(container)
  workflow.currentStepId = 'triage_exception'
  await expect(service.reply(identity, caseId, submissionId, {
    eventId: 'native-reply', text: 'Resolve an employee exception',
  })).rejects.toMatchObject({ status: 409 })
  workflow.currentStepId = 'client_reply'
  workflow.context[CLIENT_TRIAGE_RESULT_KEY].result.targets.submissionId = foreignId
  await expect(service.reply(identity, caseId, submissionId, {
    eventId: 'native-reply', text: 'Clarification',
  })).rejects.toMatchObject({ status: 409 })
  expect(tx.persist).not.toHaveBeenCalled()
  expect(sendSignal).not.toHaveBeenCalled()
})

it.each(['tenantId', 'organizationId', 'customerEntityId', 'caseId'])('rejects a submission with foreign %s before storing or signaling', async (field) => {
  submission[field] = foreignId
  const service = createClientReplyService(container)
  await expect(service.reply(identity, caseId, submissionId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 404 })
  await expect(service.list(identity, caseId, submissionId)).rejects.toMatchObject({ status: 404 })
  expect(tx.persist).not.toHaveBeenCalled()
  expect(sendSignal).not.toHaveBeenCalled()
})

it('rejects inactive linkage, a different native workflow, and a saved non-clarification decision', async () => {
  const service = createClientReplyService(container)
  customer.mockResolvedValueOnce({ isActive: false, customerEntityId: identity.customerEntityId })
  await expect(service.reply(identity, caseId, submissionId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 403 })
  workflow.workflowId = 'unrelated.workflow'
  await expect(service.reply(identity, caseId, submissionId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 409 })
  workflow.workflowId = CLIENT_SUBMISSION_WORKFLOW_ID
  workflow.context[CLIENT_TRIAGE_RESULT_KEY].result.kind = 'answer'
  await expect(service.reply(identity, caseId, submissionId, { eventId: '1', text: 'Hello' })).rejects.toMatchObject({ status: 409 })
  expect(tx.persist).not.toHaveBeenCalled()
  expect(sendSignal).not.toHaveBeenCalled()
})

it('propagates failed signal delivery out of the transaction and does not report acceptance', async () => {
  sendSignal.mockRejectedValueOnce(new Error('Native signal failed'))
  await expect(createClientReplyService(container).reply(identity, caseId, submissionId, { eventId: '1', text: 'Hello' })).rejects.toThrow('Native signal failed')
  expect(stored).toBeUndefined()
  expect(workflow.status).toBe('PAUSED')
})
