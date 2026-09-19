import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgentRun } from '@open-mercato/enterprise/modules/agent_orchestrator/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { TOV_SOURCE_SCOUT_AGENT_ID } from '@/modules/agency_tov/lib/agentIds'
import { AgencyCase } from '../../../data/entities'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../../analysisProcess/workflow'
import { PAID_CASE_ANALYSIS_CONTEXT } from '../../paidCaseAnalysis/contracts'
import { TOV_DISCOVERY_STEP_ID } from '../contracts'
import { createTovDiscoveryService } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const userId = uuid(3), caseId = uuid(4), customerEntityId = uuid(5), analysisId = uuid(6), runId = uuid(7)

const scoutResult = {
  kind: 'research' as const,
  data: {
    notes: 'Public channels found; staff review is still required.',
    targets: [
      { source: 'linkedin' as const, url: 'https://example.test/person', owner: 'Person', material: 'posts', confidence: 0.9, evidenceUrl: 'https://example.test/about' },
      { source: 'youtube' as const, url: 'https://example.test/video', owner: 'Person', material: 'talks', confidence: 0.95, evidenceUrl: 'https://example.test/about' },
      { source: 'x' as const, url: 'https://example.test/short', owner: 'Person', material: 'posts', confidence: 0.4, evidenceUrl: 'https://example.test/about' },
    ],
  },
}

function fixture(outcome: 'ok' | 'error' = 'ok') {
  const agencyCase = Object.assign(new AgencyCase(), {
    id: caseId, ...scope, customerEntityId,
    agentWorkerId: 'agency_operations.agent-worker.analysis.v1', workflowInstanceId: analysisId,
  })
  const analysis = Object.assign(new WorkflowInstance(), {
    id: analysisId, ...scope, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID,
    context: { caseId, customerEntityId, [PAID_CASE_ANALYSIS_CONTEXT]: {
      orderId: uuid(20), paymentId: uuid(21), purchaseWorkflowInstanceId: uuid(22), materialHash: 'a'.repeat(64),
    } },
  })
  let savedRun: AgentRun | null = null
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const query = where as Record<string, unknown>
    if (query.tenantId !== scope.tenantId || query.organizationId !== scope.organizationId) return null
    if (entity === AgencyCase && (query.id === caseId || query.workflowInstanceId === analysisId)) return agencyCase as never
    if (entity === WorkflowInstance && query.id === analysisId) return analysis as never
    if (entity === AgentRun && savedRun && (query.id === savedRun.id || (
      query.workflowInstanceId === analysisId && query.stepId === TOV_DISCOVERY_STEP_ID && query.invocationId === savedRun.invocationId
    ))) return savedRun as never
    return null
  })
  const run = jest.fn(async (_agentId: string, _input: unknown, context: Record<string, any>) => {
    savedRun = Object.assign(new AgentRun(), {
      id: runId, ...scope, agentId: TOV_SOURCE_SCOUT_AGENT_ID, status: outcome, input: _input,
      output: outcome === 'ok' ? scoutResult : null,
      workflowInstanceId: context.workflowInstanceId, stepId: context.stepId, invocationId: context.invocationId,
    })
    context.onRunPersisted(runId)
    if (outcome === 'error') throw new Error('provider unavailable')
    return scoutResult
  })
  const userHasAllFeatures = jest.fn(async () => true)
  const sourceOf = jest.fn((url: string) => url.endsWith('/person') ? 'linkedin' : url.endsWith('/short') ? 'x' : null)
  const services: Record<string, unknown> = {
    em: {}, agentRuntime: { run }, rbacService: { userHasAllFeatures },
    agencyTovCorpusScraper: { available: () => true, sourceOf },
  }
  const container = {
    resolve: jest.fn((name: string) => services[name]),
    hasRegistration: jest.fn((name: string) => name in services),
  }
  return { container, run, userHasAllFeatures }
}

const request = {
  ...scope,
  userId,
  caseId,
  eventId: 'staff-discovery-1',
  brand: 'Example',
  people: [{ name: 'Person', knownUrls: ['https://example.test/person'] }],
  websiteUrl: 'https://example.test',
  outputLanguage: 'pl' as const,
}

describe('case-scoped ToV source discovery', () => {
  beforeEach(() => jest.clearAllMocks())

  it('runs the native source scout against the paid case and keeps targets separate from corpus acceptance', async () => {
    const test = fixture()
    const result = await createTovDiscoveryService(test.container as never).start(request)

    expect(test.userHasAllFeatures).toHaveBeenCalledWith(userId, [
      'agency_operations.cases.view', 'customers.companies.view', 'agency_tov.manage',
      'agent_orchestrator.agents.run', 'agent_orchestrator.web_search', 'agent_orchestrator.web_fetch',
    ], scope)
    expect(test.run).toHaveBeenCalledWith(TOV_SOURCE_SCOUT_AGENT_ID, {
      brand: 'Example', people: request.people, websiteUrl: 'https://example.test', outputLanguage: 'pl',
    }, expect.objectContaining({
      ...scope, userId, workflowInstanceId: analysisId, stepId: TOV_DISCOVERY_STEP_ID, invocationId: request.eventId,
    }))
    expect(result).toMatchObject({
      discoveryRunId: runId, caseId, customerEntityId, state: 'completed', replayed: false,
      collectorAvailable: true,
      collectorCandidateCount: 1,
      handoff: {
        state: 'awaiting_staff_corpus', corpusReady: false, intakeStarted: false,
        reason: 'source_scout_returns_targets_not_normalized_corpus',
        suppliedCorpusEndpoint: '/api/agency_operations/tov-intakes',
      },
    })
    expect(result.targets).toEqual([
      expect.objectContaining({ source: 'linkedin', collectorSupported: true, meetsMinimumConfidence: true }),
      expect.objectContaining({ source: 'youtube', collectorSupported: false, meetsMinimumConfidence: true }),
      expect.objectContaining({ source: 'x', collectorSupported: true, meetsMinimumConfidence: false }),
    ])
  })

  it('returns the exact saved case invocation without paying for an implicit retry', async () => {
    const test = fixture()
    const service = createTovDiscoveryService(test.container as never)
    await service.start(request)
    const replay = await service.start(request)

    expect(replay).toMatchObject({ discoveryRunId: runId, replayed: true, state: 'completed' })
    expect(test.run).toHaveBeenCalledTimes(1)
    expect(findOneWithDecryption).toHaveBeenCalledWith(expect.anything(), AgentRun, expect.objectContaining({
      ...scope, agentId: TOV_SOURCE_SCOUT_AGENT_ID, workflowInstanceId: analysisId,
      stepId: TOV_DISCOVERY_STEP_ID, invocationId: request.eventId,
    }), undefined, scope)
  })

  it('keeps a failed saved run unavailable and requires a new explicit event for any retry', async () => {
    const test = fixture('error')
    const service = createTovDiscoveryService(test.container as never)
    const failed = await service.start(request)
    const replay = await service.start(request)

    expect(failed).toMatchObject({ state: 'attention_required', runStatus: 'error', handoff: {
      state: 'discovery_attention_required', corpusReady: false,
      reason: 'source_discovery_did_not_complete',
      nextAction: 'review_run_and_submit_new_event_if_authorized',
    } })
    expect(replay).toMatchObject({ discoveryRunId: runId, replayed: true, state: 'attention_required' })
    expect(test.run).toHaveBeenCalledTimes(1)
  })
})
