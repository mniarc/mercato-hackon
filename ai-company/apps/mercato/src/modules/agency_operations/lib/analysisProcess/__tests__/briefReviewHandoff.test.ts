/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AGENCY_RESEARCH_SERVICE } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../../data/entities'
import { BRIEF_REVIEW_SERVICE } from '../../briefStrategyProcess/contracts'
import { createAnalysisBriefReviewHandoff } from '../briefReviewHandoff'
import { AGENCY_ANALYSIS_RESULT_KEY, AGENCY_ANALYSIS_WORKFLOW_ID } from '../workflow'
import type { AnalysisProcessResult } from '../contracts'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
}))

const tenantId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const caseId = '00000000-0000-4000-8000-000000000003'
const workflowInstanceId = '00000000-0000-4000-8000-000000000004'
const userId = '00000000-0000-4000-8000-000000000005'
const foreignId = '00000000-0000-4000-8000-000000000006'
const versionId = 'brief-version-2'
const scope = { tenantId, organizationId }
const em = {}
const status = jest.fn()
const invite = jest.fn()
const invitation = { workflowInstanceId: 'review-workflow-1', taskId: 'review-task-1', replayed: false }
let agencyCase: Record<string, unknown>
const container = { resolve(key: string) {
  if (key === 'em') return em
  if (key === AGENCY_RESEARCH_SERVICE) return { status }
  if (key === BRIEF_REVIEW_SERVICE) return { invite }
  throw new Error(key)
} } as unknown as AppContainer

function context(change: Partial<AnalysisProcessResult> = {}) {
  const result: AnalysisProcessResult = {
    caseId, requestedThrough: '4.2', completedThrough: '4.2', state: 'completed',
    taskRunIds: ['research-task-1'], documentVersionIds: [versionId, 'qa-version-2'],
    agentRunIds: ['agent-run-1'], spentPln: 0.1, briefQaVerdict: 'ready_for_approval',
    ...change,
  }
  return {
    userId,
    workflowInstance: {
      id: workflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, ...scope,
      context: { [AGENCY_ANALYSIS_RESULT_KEY]: { result } },
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  agencyCase = { id: caseId, ...scope, workflowInstanceId, deletedAt: null }
  findOne.mockImplementation((_em, _type, where: Record<string, unknown>) => (
    Object.entries(where).every(([key, value]) => agencyCase[key] === value) ? agencyCase : null
  ))
  status.mockResolvedValue({ documents: [
    { templateId: 'WZR-USTALENIA', versionId: 'findings-version-1' },
    { templateId: 'WZR-BRIEF', versionId },
  ] })
  invite.mockResolvedValue(invitation)
})

it.each([
  { briefQaVerdict: 'ready_for_approval' as const, state: 'completed' as const },
  { briefQaVerdict: 'needs_client_data' as const, state: 'waiting' as const },
])('hands the exact current brief to review after $briefQaVerdict through 4.2', async (outcome) => {
  await expect(createAnalysisBriefReviewHandoff(container)({}, context(outcome))).resolves.toEqual({ invitation })
  expect(findOne).toHaveBeenCalledWith(em, AgencyCase, { ...scope, id: caseId, workflowInstanceId, deletedAt: null }, undefined, scope)
  expect(status).toHaveBeenCalledWith(scope, caseId)
  expect(invite).toHaveBeenCalledTimes(1)
  expect(invite).toHaveBeenCalledWith({ ...scope, userId, caseId, versionId })
})

it.each<Partial<AnalysisProcessResult>>([
  { requestedThrough: '3.8', completedThrough: '3.8' },
  { completedThrough: '3.8', state: 'waiting' },
  { briefQaVerdict: 'needs_agent_fix', state: 'waiting' },
  { escalationVersionId: 'escalation-version-1', state: 'waiting' },
])('does not invite before a client-reviewable brief exists: %p', async (outcome) => {
  await expect(createAnalysisBriefReviewHandoff(container)({}, context(outcome))).resolves.toEqual({ invitation: null, reason: 'brief_not_ready' })
  expect(findOne).not.toHaveBeenCalled()
  expect(status).not.toHaveBeenCalled()
  expect(invite).not.toHaveBeenCalled()
})

it.each(['tenantId', 'organizationId', 'workflowInstanceId'])('rejects a case outside the originating %s', async (field) => {
  agencyCase[field] = foreignId
  await expect(createAnalysisBriefReviewHandoff(container)({}, context())).rejects.toThrow('outside the originating analysis workflow')
  expect(status).not.toHaveBeenCalled()
  expect(invite).not.toHaveBeenCalled()
})

it('rejects a newer current brief that is not an output of this saved analysis', async () => {
  status.mockResolvedValue({ documents: [{ templateId: 'WZR-BRIEF', versionId: 'brief-version-3' }] })
  await expect(createAnalysisBriefReviewHandoff(container)({}, context())).rejects.toThrow('not an output of the saved analysis result')
  expect(invite).not.toHaveBeenCalled()
})
