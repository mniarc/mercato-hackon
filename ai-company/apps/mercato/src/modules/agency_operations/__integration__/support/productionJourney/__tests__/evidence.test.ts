jest.mock('@open-mercato/core/helpers/integration/dbFixtures', () => ({ withClient: jest.fn() }))
import { observationsFromRows, type NativeEvidenceRows } from '../evidence'

const rows = (): NativeEvidenceRows => ({ runs: [], tasks: [], versions: [], specialistVersions: [], reviews: [] })
const edges = (input: NativeEvidenceRows) => observationsFromRows(input).filter((event) => event.integrationId)
it('uses native statuses, retaining failed and incomplete runs without inventing success', () => {
  const input = rows()
  input.runs = ['ok', 'error', 'running'].map((status) => ({ id: status, agent_id: 'agency_tov.batch_analyst', status, workflow_instance_id: 'workflow' }))
  expect(observationsFromRows(input).map((event) => event.phase)).toEqual(['completed', 'failed', 'started'])
})
it('proves a review handoff only from the exact produced version and native task', () => {
  const input = rows()
  input.tasks = [{ id: 'producer', step_id: '4.1', status: 'done', output_version_id: 'version', input_versions: [] }]
  input.reviews = [{ id: 'task', workflow_instance_id: 'workflow', workflow_id: 'agency_operations.brief-review.v1',
    context: { briefReviewInvitation: { review: { versionId: 'other-version' } } } }]
  expect(observationsFromRows(input)).toEqual([])
  input.reviews[0].context = { briefReviewInvitation: { review: { versionId: 'version' } } }
  expect(observationsFromRows(input)).toEqual([expect.objectContaining({ integrationId: 'research-brief-to-client-review',
    refs: { producerRunId: 'producer', userTaskId: 'task', workflowInstanceId: 'workflow', outputVersionId: 'version' } })])
})
it('does not infer specialist consumption from co-occurring runs or a different version', () => {
  const input = rows()
  input.specialistVersions = [{ id: 'native-version', document_id: 'native-document', research_run_id: 'native-research', version: '2.0' }]
  const reference = { owner: 'agency_tov', documentId: 'native-document', researchRunId: 'native-research', versionId: 'other-version' }
  input.tasks = [{ id: 'consumer', step_id: '5.4', status: 'done', output_version_id: 'strategy-version',
    input_versions: [{ version: '2.0', specialistTov: reference }] }]
  expect(observationsFromRows(input)).toEqual([])
  reference.versionId = 'native-version'
  expect(observationsFromRows(input)).toEqual([expect.objectContaining({ integrationId: 'specialist-tov-to-strategy',
    refs: { producerRunId: 'native-research', consumerRunId: 'consumer', outputVersionId: 'native-version' } })])
})

it('requires the exact source version consumed by the audit task', () => {
  const input = rows()
  input.versions = [{ id: 'sources-v2', document_id: 'sources-document', version: '2.0' }]
  input.tasks = [
    { id: 'sources', step_id: '3.2', status: 'done', output_version_id: 'sources-v2', input_versions: [] },
    { id: 'audit', step_id: '3.3', status: 'done', output_version_id: 'audit-v1', input_versions: [{ document_id: 'sources-document', version: '1.0' }] },
  ]
  expect(edges(input)).toEqual([])
  input.tasks[1].input_versions = [{ document_id: 'sources-document', version: '2.0' }]
  expect(edges(input)).toEqual([expect.objectContaining({ integrationId: 'research-sources-to-audit',
    refs: { producerRunId: 'sources', consumerRunId: 'audit', outputVersionId: 'sources-v2' } })])
})

it('records conditional people discovery only when its native run is linked to the saved source result', () => {
  const input = rows()
  input.runs = [{ id: 'people-run', agent_id: 'agency_research.people_finder', status: 'ok', workflow_instance_id: 'analysis' }]
  input.versions = [{ id: 'sources-version', document_id: 'sources', version: '1.0' }]
  input.tasks = [{ id: 'source-task', step_id: '3.2', status: 'done', output_version_id: 'sources-version', input_versions: [],
    agent_run_ids: ['people-run'], people: null }]
  expect(edges(input)).toEqual([])
  input.tasks[0].people = { candidates: 1 }
  expect(edges(input)).toEqual([expect.objectContaining({ integrationId: 'research-people-to-sources',
    refs: { producerRunId: 'people-run', consumerRunId: 'source-task', outputVersionId: 'sources-version' } })])
  input.tasks[0].agent_run_ids = ['another-run']
  expect(edges(input)).toEqual([])
})

it('links captured payment to analysis only through its saved origin and persisted research activation', () => {
  const input = rows()
  input.captures = [{ id: 'capture', payment_id: 'payment', order_id: 'order' }]
  input.tasks = [{ id: 'activation', step_id: '3.1', status: 'done', output_version_id: 'order-version', input_versions: [] }]
  input.workflows = [{ id: 'analysis', workflow_id: 'agency_operations.analysis.v1', status: 'COMPLETED',
    context: { purchase: { orderId: 'order', paymentId: 'other-payment' }, research_result: { result: { taskRunIds: ['activation'] } } } }]
  expect(edges(input)).toEqual([])
  input.workflows[0].context.purchase = { orderId: 'order', paymentId: 'payment' }
  expect(edges(input)).toEqual([expect.objectContaining({ integrationId: 'paid-capture-to-analysis',
    refs: { producerRunId: 'capture', consumerRunId: 'activation', workflowInstanceId: 'analysis' } })])
  input.workflows[0].context.research_result = { result: { taskRunIds: [] } }
  expect(edges(input)).toEqual([])
})

it('requires the original answer binding, saved revision output and exact new review invitation', () => {
  const input = rows()
  input.submissions = [{ id: 'answer', workflow_instance_id: 'submission-workflow', previous_version_id: 'old-brief' }]
  input.tasks = [{ id: 'revision-producer', step_id: '4.1', status: 'done', output_version_id: 'new-brief', input_versions: [] }]
  const result = { status: 'completed', submissionId: 'answer', previousBriefVersionId: 'old-brief',
    briefVersionId: 'new-brief', taskRunIds: ['revision-producer'], documentVersionIds: ['new-brief'] }
  input.workflows = [{ id: 'submission-workflow', workflow_id: 'agency_operations.client-submission.native.v1', status: 'COMPLETED',
    context: { execute_brief_revision_result: { result } } }]
  input.reviews = [{ id: 'invitation', workflow_instance_id: 'review-workflow', workflow_id: 'agency_operations.brief-review.v1',
    context: { briefReviewInvitation: { review: { versionId: 'old-brief' } } } }]
  const revisedEdges = () => edges(input).filter((event) => event.integrationId === 'brief-answer-to-revised-review')
  expect(revisedEdges()).toEqual([])
  input.reviews[0].context = { briefReviewInvitation: { review: { versionId: 'new-brief' } } }
  expect(revisedEdges()).toEqual([expect.objectContaining({ refs: { producerRunId: 'revision-producer',
    userTaskId: 'invitation', workflowInstanceId: 'submission-workflow', outputVersionId: 'new-brief' } })])
  result.submissionId = 'different-answer'
  expect(revisedEdges()).toEqual([])
})

it('links specialist corpus intake only to its completed persisted version, never a merely co-occurring run', () => {
  const input = rows()
  input.corpusAttachments = [{ id: 'corpus', record_id: 'intake' }]
  input.specialistVersions = [{ id: 'tov-version', document_id: 'tov-document', research_run_id: 'tov-run', version: '1.0' }]
  input.workflows = [{ id: 'tov-workflow', workflow_id: 'agency_operations.tov-research.v1', status: 'RUNNING',
    context: { staffTovIntake: { intakeId: 'intake', corpusAttachmentId: 'corpus' },
      research_tov_result: { result: { researchRunId: 'tov-run', documentVersionIds: ['tov-version'] } } } }]
  expect(edges(input)).toEqual([])
  input.workflows[0].status = 'COMPLETED'
  expect(edges(input)).toEqual([expect.objectContaining({ integrationId: 'material-to-tov-profile',
    refs: { producerRunId: 'tov-workflow', consumerRunId: 'tov-run', outputVersionId: 'tov-version' } })])
  input.corpusAttachments[0].record_id = 'another-intake'
  expect(edges(input)).toEqual([])
})
