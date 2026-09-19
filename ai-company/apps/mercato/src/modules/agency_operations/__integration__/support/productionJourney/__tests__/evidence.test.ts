jest.mock('@open-mercato/core/helpers/integration/dbFixtures', () => ({ withClient: jest.fn() }))
import { observationsFromRows, type NativeEvidenceRows } from '../evidence'

const rows = (): NativeEvidenceRows => ({ runs: [], tasks: [], versions: [], specialistVersions: [], reviews: [] })
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
