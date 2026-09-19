/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { workflowStepSchema, workflowTransitionSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))

import { createAnalysisWorkflowActivity, parseAnalysisMaterial } from '../activity'
import { AGENCY_ANALYSIS_WORKFLOW_ID, AGENCY_ANALYSIS_RESULT_KEY, createAgencyAnalysisWorkflowDefinition } from '../workflow'
import type { AnalysisExecutionPolicy } from '../contracts'
import { loadCaseMaterialSources } from '../materialSources'
jest.mock('../materialSources', () => ({ loadCaseMaterialSources: jest.fn() }))

const tenantId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const caseId = '00000000-0000-4000-8000-000000000003'
const workflowId = '00000000-0000-4000-8000-000000000004'
const userId = '00000000-0000-4000-8000-000000000005'
const stepInstanceId = '00000000-0000-4000-8000-000000000006'
const product = { sku: 'explicit-test-product', offer_version: 'test-v1', price_net: 123, currency: 'PLN', result_limits: { topics: 7 } }
const policy: AnalysisExecutionPolicy = { through: '3.8', maxCostPln: 2, productSelection: product }
const material = {
  order: { product_selection: product, brand: { display_name: 'Example', website_url: 'https://example.test' }, market_language: { market: 'PL', language: 'pl' } },
  pages: ['https://example.test/about'],
  orderRef: 'forged-order', through: '4.2', maxCostPln: 999,
}
const context = () => ({
  userId, stepInstanceId,
  workflowInstance: { id: workflowId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, tenantId, organizationId, status: 'RUNNING', context: {} as Record<string, unknown> },
})
const result = { taskRunIds: ['task-1'], documentVersionIds: ['version-1'], agentRunIds: ['native-run-1'], spentPln: 0.1, completedThrough: '3.8', qaVerdict: 'ready' }
const readScoped = jest.fn()
const run = jest.fn()
const status = jest.fn()
const container = { resolve: (key: string) => {
  if (key === 'em') return {}
  if (key === 'attachmentService') return { readScoped }
  if (key === 'agencyResearchService') return { run, status }
  throw new Error(key)
} } as unknown as AppContainer
const originalEnabled = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  findOne.mockResolvedValue({ id: caseId, materialAttachmentId: 'attachment-1' })
  readScoped.mockResolvedValue({ buffer: Buffer.from(JSON.stringify(material)) })
  status.mockResolvedValue({ taskRuns: [], documents: [], sources: 0, totalPln: 0 })
  run.mockResolvedValue(result)
  jest.mocked(loadCaseMaterialSources).mockResolvedValue([])
})
afterAll(() => {
  if (originalEnabled === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = originalEnabled
})

it('uses the exact case/private material and native identity, ignoring upload spend/orderRef/stage', async () => {
  const output = await createAnalysisWorkflowActivity(container)({ caseId, policy }, context())
  expect(findOne).toHaveBeenCalledWith(expect.anything(), expect.anything(), { id: caseId, tenantId, organizationId, workflowInstanceId: workflowId, deletedAt: null }, undefined, { tenantId, organizationId })
  expect(readScoped).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'attachment-1', requirePrivatePartition: true, expectedOwner: expect.objectContaining({ recordId: caseId }), auth: { sub: userId, tenantId, orgId: organizationId } }))
  expect(status).toHaveBeenCalledWith({ tenantId, organizationId }, caseId)
  expect(run).toHaveBeenCalledWith({
    context: { tenantId, organizationId, userId, workflowInstanceId: workflowId, stepId: 'research', invocationId: stepInstanceId },
    request: { order: material.order, pages: material.pages, materialSources: [], orderRef: caseId, through: '3.8', maxCostPln: 2 },
  })
  expect(output).toEqual({ ...result, caseId, requestedThrough: '3.8', state: 'completed' })
  expect(loadCaseMaterialSources).toHaveBeenCalledWith(container, { tenantId, organizationId }, caseId, userId)
})

it.each(['client', 'synthetic'] as const)('passes %s onboarding context unchanged to the teammate research service', async (provenance) => {
  const onboardingContext = {
    provenance,
    answers: [{ question_id: 'audience', question: 'Do kogo kierujemy ofertę?', answer: 'Do firm usługowych.', ref: provenance === 'client' ? 'submission-1' : null }],
    competitor_urls: ['https://example.test/competitor'],
  }
  readScoped.mockResolvedValue({ buffer: Buffer.from(JSON.stringify({ ...material, onboardingContext })) })

  await createAnalysisWorkflowActivity(container)({ caseId, policy }, context())

  expect(run.mock.calls[0][0].request.onboardingContext).toEqual(onboardingContext)
})

it('accepts the native transition activity context without inventing an invocation ID', async () => {
  const nativeTransitionContext = { userId, workflowInstance: context().workflowInstance }
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, nativeTransitionContext)).resolves.toMatchObject({ state: 'completed' })
  expect(run.mock.calls[0][0].context).toEqual({ tenantId, organizationId, userId, workflowInstanceId: workflowId, stepId: 'research' })
  expect(run.mock.calls[0][0].context).not.toHaveProperty('invocationId')
})

it('does not run for a foreign case or workflow', async () => {
  findOne.mockResolvedValue(null)
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, context())).rejects.toThrow()
  expect(readScoped).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  expect(loadCaseMaterialSources).not.toHaveBeenCalled()
})

it('rejects customer-chosen product limits instead of authorizing them', async () => {
  readScoped.mockResolvedValue({ buffer: Buffer.from(JSON.stringify({ ...material, order: { ...material.order, product_selection: { ...product, result_limits: { topics: 999 } } } })) })
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, context())).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
  expect(() => parseAnalysisMaterial(Buffer.from(JSON.stringify({ order: { ...material.order, product_selection: { ...product, result_limits: undefined } } })))).toThrow()
})

it('replays an already saved native result without invoking the research pipeline again', async () => {
  const execution = context()
  const saved = { ...result, caseId, requestedThrough: '3.8', state: 'completed' }
  execution.workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] = { result: saved }
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, execution)).resolves.toEqual(saved)
  expect(run).not.toHaveBeenCalled()
  expect(readScoped).not.toHaveBeenCalled()
})

it('refuses a whole-analysis rerun when service persistence outlived the native result', async () => {
  status.mockResolvedValue({ taskRuns: [{ id: 'existing-task', status: 'done' }] })
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, context())).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

it('ordinary redelivery neither resumes a running producer nor re-spends a saved budget hold', async () => {
  status.mockResolvedValue({ taskRuns: [{ id: 'existing-task', stepId: '3.2', status: 'running' }] })
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, context())).rejects.toMatchObject({ status: 409 })
  const execution = context()
  const saved = { ...result, completedThrough: null, caseId, requestedThrough: '3.8', state: 'waiting' }
  execution.workflowInstance.context[AGENCY_ANALYSIS_RESULT_KEY] = { result: saved }
  execution.workflowInstance.context.restart = { previousWorkflowInstanceId: workflowId, by: userId, attempt: 1 }
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, execution)).resolves.toEqual(saved)
  expect(run).not.toHaveBeenCalled()
})

it('fixture analysis never resolves the paid social scraper even with a buyer profile', async () => {
  const previousFixture = process.env.AGENCY_TEST_NATIVE_TRIAGE
  process.env.AGENCY_TEST_NATIVE_TRIAGE = '1'
  readScoped.mockResolvedValue({ buffer: Buffer.from(JSON.stringify({ ...material, order: { ...material.order, official_social: { url: 'https://www.linkedin.com/company/example/' } } })) })
  try {
    await createAnalysisWorkflowActivity(container)({ caseId, policy }, context())
    expect(run.mock.calls[0][0].request).not.toHaveProperty('socialPosts')
  } finally {
    if (previousFixture === undefined) delete process.env.AGENCY_TEST_NATIVE_TRIAGE
    else process.env.AGENCY_TEST_NATIVE_TRIAGE = previousFixture
  }
})

it('uses an explicit terminal-recovery override inside the pinned intake range, not as queue retry authority', async () => {
  const execution = context()
  execution.workflowInstance.context.restart = { previousWorkflowInstanceId: stepInstanceId, by: userId, attempt: 1, resumeFrom: '3.5' }
  findOne.mockImplementation(async (_em, entity) => entity === AgentRun ? null : entity === WorkflowInstance
    ? { metadata: { entityType: 'agency_operations:agency_case', entityId: caseId } }
    : { id: caseId, materialAttachmentId: 'attachment-1' })
  status.mockResolvedValue({ taskRuns: [{ stepId: '3.2', status: 'done' }] })
  await createAnalysisWorkflowActivity(container)({ caseId, policy }, execution)
  expect(run.mock.calls[0][0].request.resumeFrom).toBe('3.5')
  run.mockClear()
  execution.workflowInstance.context.restart = { previousWorkflowInstanceId: stepInstanceId, by: userId, attempt: 1, resumeFrom: '4.2' }
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, execution)).rejects.toMatchObject({ status: 409 })
  expect(run).not.toHaveBeenCalled()
})

it.each([
  { completedThrough: null },
  { completedThrough: '3.5' },
  { qaVerdict: 'exception', escalationVersionId: 'exception-v1' },
  { qaVerdict: 'to_fix' },
])('preserves exact partial references and waits for unresolved outcome %p', async (change) => {
  run.mockResolvedValue({ ...result, ...change })
  const output = await createAnalysisWorkflowActivity(container)({ caseId, policy }, context())
  expect(output).toEqual({ ...result, ...change, caseId, requestedThrough: '3.8', state: 'waiting' })
})

it('does not claim brief-ready delivery when the service requires client data', async () => {
  run.mockResolvedValue({ ...result, completedThrough: '4.2', briefQaVerdict: 'needs_client_data' })
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy: { ...policy, through: '4.2' } }, context())).resolves.toMatchObject({ state: 'waiting', briefQaVerdict: 'needs_client_data' })
})

it('requires opt-in and refuses terminal workflows', async () => {
  delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, context())).rejects.toThrow()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  const execution = context()
  execution.workflowInstance.status = 'COMPLETED'
  await expect(createAnalysisWorkflowActivity(container)({ caseId, policy }, execution)).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

it('pins staff policy in the native activity and keeps incomplete work away from END', () => {
  const definition = createAgencyAnalysisWorkflowDefinition(policy)
  definition.steps.forEach((step) => workflowStepSchema.parse(step))
  definition.transitions.forEach((transition) => workflowTransitionSchema.parse(transition))
  const activity = definition.transitions.find((transition) => transition.transitionId === 'save_research')!.activities![0]
  expect(activity.config.args).toEqual({ caseId: '{{context.caseId}}', policy })
  expect(activity.retryPolicy?.maxAttempts).toBe(1)
  expect(AGENCY_ANALYSIS_RESULT_KEY).toBe(`${activity.activityId}_result`)
  expect(activity.activityName).toBe(AGENCY_ANALYSIS_RESULT_KEY)
  expect(definition.transitions.find((transition) => transition.toStepId === 'completed')!.condition).toEqual({ operator: 'AND', rules: [
    { field: 'agencyResearchException.result.kind', operator: '=', value: 'none' },
    { field: `${AGENCY_ANALYSIS_RESULT_KEY}.result.state`, operator: '=', value: 'completed' },
  ] })
  expect(definition.steps.find((step) => step.stepId === 'waiting')!.stepType).toBe('WAIT_FOR_SIGNAL')
  expect(definition.transitions.some((transition) => transition.fromStepId === 'waiting')).toBe(false)
  expect(definition.transitions.find((transition) => transition.transitionId === 'research_exception_keep_blocked')?.toStepId).toBe('waiting')
})

it('hands off saved brief outcomes through the native function before routing the research result', () => {
  const definition = createAgencyAnalysisWorkflowDefinition({ ...policy, through: '4.2' })
  definition.steps.forEach((step) => workflowStepSchema.parse(step))
  definition.transitions.forEach((transition) => workflowTransitionSchema.parse(transition))
  expect(definition.transitions.find((transition) => transition.transitionId === 'handoff_brief')).toMatchObject({
    fromStepId: 'exception_checked', toStepId: 'brief_handoff',
    activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.handoffAnalysisBrief' } }],
  })
  expect(definition.transitions.find((transition) => transition.toStepId === 'completed')?.fromStepId).toBe('brief_handoff')
  expect(definition.transitions.find((transition) => transition.transitionId === 'waiting')?.fromStepId).toBe('brief_handoff')
  expect(definition.transitions.find((transition) => transition.transitionId === 'assign_research_exception')).toMatchObject({
    fromStepId: 'exception_checked', toStepId: 'research_exception',
    condition: { field: 'agencyResearchException.result.kind', operator: '=', value: 'employee_exception' },
  })
})
