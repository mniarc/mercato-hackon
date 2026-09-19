/** @jest-environment node */
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { createMaterialRevisionActivity } from '../activity'

const load = jest.fn()
jest.mock('../binding', () => ({ createMaterialRevisionBinding: () => ({ load }) }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const material = { attachmentId: uuid(7), submissionId: uuid(4), fileName: 'client.txt', text: 'Evidence', submittedAt: '2026-09-19T10:00:00.000Z' }
const bound = { orderRef: uuid(3), materialContext: { state: 'eligible', brief: { versionId: uuid(6), clientViewMd: 'Brief' }, material },
  directive: { question: 'Which evidence supports the offer?', briefField: 'priority_offer' },
  source: { submissionId: uuid(4), eventId: 'upload', customerUserId: uuid(8), workflowInstanceId: uuid(5) } }
const context = { workflowInstance: { id: uuid(5), ...scope, workflowId: 'agency_operations.client-submission.native.v1' } }
const runMaterialRevision = jest.fn()
const services: Record<string, unknown> = { em: {}, agencyResearchService: { runMaterialRevision } }
const container = { resolve: (key: string) => services[key] }
const oldFlag = process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
function arrange(authorization: unknown = { maxCostPln: 2 }) {
  jest.mocked(findOneWithDecryption).mockReset()
    .mockResolvedValueOnce({ id: uuid(4), caseId: uuid(3), customerEntityId: uuid(8) } as never)
    .mockResolvedValueOnce({ id: uuid(5), context: { nativeClientTriageInterpretation: {}, clientTriageResult: { result: {
      kind: 'change', source: 'native_agent', workerId: 'agency_operations.client_triage', rationale: 'Bounded evidence', message: '', effectsApplied: false,
      targets: { caseId: uuid(3), submissionId: uuid(4), documentVersionReference: uuid(6) },
    } } } } as never)
    .mockResolvedValueOnce({ id: uuid(3), workflowInstanceId: uuid(10) } as never)
    .mockResolvedValueOnce({ id: uuid(10), definitionId: uuid(11), workflowId: 'agency_operations.analysis.v1', version: 1 } as never)
    .mockResolvedValueOnce({ metadata: { generatedBy: { module: 'agency_operations', ownerId: 'analysis' } },
      definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.runAnalysis', args: {
        policy: { maxCostPln: 999, briefRevision: { maxCostPln: 999 }, materialRevision: authorization },
      } } }] }] } } as never)
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = 'true'
  load.mockResolvedValue(bound)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(uuid(12))
  runMaterialRevision.mockResolvedValue({ status: 'not_ready', orderRef: uuid(3), reason: 'input_changed' })
  arrange()
})
afterAll(() => {
  if (oldFlag === undefined) delete process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED
  else process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED = oldFlag
})

test('invokes genuine revision with the exact saved material/directive and explicit separate cap', async () => {
  await createMaterialRevisionActivity(container as never)({ maxCostPln: 999 }, context)
  expect(runMaterialRevision).toHaveBeenCalledWith({
    context: { ...scope, userId: uuid(12), workflowInstanceId: uuid(5), stepId: 'material_revision' },
    request: { orderRef: uuid(3), briefVersionId: uuid(6), source: bound.source, material,
      directive: bound.directive, maxCostPln: 2 },
  })
})

test('does not borrow an initial-analysis or answer-revision budget', async () => {
  arrange(null)
  await expect(createMaterialRevisionActivity(container as never)({}, context)).resolves.toEqual({
    status: 'not_configured', orderRef: uuid(3), reason: 'missing_material_revision_authorization',
  })
  expect(runMaterialRevision).not.toHaveBeenCalled()
})

test('retains approved/downstream impact as an explicit hold without invoking revision', async () => {
  load.mockResolvedValue({ ...bound, materialContext: { ...bound.materialContext, state: 'impact_review_required' } })
  await expect(createMaterialRevisionActivity(container as never)({}, context)).resolves.toEqual({
    status: 'not_ready', orderRef: uuid(3), reason: 'impact_review_required',
  })
  expect(runMaterialRevision).not.toHaveBeenCalled()
})
