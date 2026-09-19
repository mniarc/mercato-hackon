/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { documentIdFor } from '../../research/envelope'
import { readStrategyPairAcceptance } from '../../strategyPairAcceptance/read'
import { acceptPlan } from '../accept'
import { readPlanReview, readPlanAcceptance } from '../read'
import type { AcceptPlanInput } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../strategyPairAcceptance/read', () => ({ readStrategyPairAcceptance: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input: AcceptPlanInput = { context: { ...scope, userId: uuid(3) }, request: { orderRef: 'case', documentId: uuid(4), versionId: uuid(5), customerUserId: uuid(6), approvePlan: true, selectedTopicId: 'TOP02',
  source: { submissionId: uuid(7), eventId: 'choice', workflowInstanceId: uuid(8), agentRunId: uuid(9), invitationTaskId: uuid(10) } } }
let document: AgencyResearchDocument
let version: AgencyResearchDocumentVersion
let qa: Record<string, unknown>
const flush = jest.fn()
const em = { flush, transactional: (work: (manager: EntityManager) => Promise<unknown>) => work(em) } as unknown as EntityManager
const topic = (topic_id: string) => ({ topic_id, topic: topic_id, day: 1, pillar_id: 'P1', audience_question: 'Question?', main_message: 'Message', format: 'text',
  angle: { tool: 'example', steps: [], status: 'creative_proposal', example: null }, claim_ids: [], seed_ids: [], fact_ids: [], proof_ids: [], source_ids: [], evidence_excerpt: 'Evidence', evidence_limits: 'Limits', post_goal: 'Goal', cta: 'Question?', cta_type: 'question', readiness: 'ready', readiness_scope: 'Topic', evidence_reuse_note: null })

beforeEach(() => {
  jest.clearAllMocks()
  document = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef: 'case', id: uuid(4), templateId: 'WZR-PLAN', deletedAt: null, currentVersionId: uuid(5), status: 'ready_for_review' })
  version = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: 'case', id: uuid(5), documentId: uuid(4), templateId: 'WZR-PLAN', versionNo: 1, status: 'draft', simulationFlag: false, clientViewMd: 'Plan', approvalRecords: [],
    inputVersions: ['WZR-STRATEGIA', 'WZR-TOV', 'WZR-BRIEF', 'WZR-ZRODLA', 'WZR-KONKURENCJA', 'WZR-ZAMOWIENIE'].map((template) => ({ document_id: documentIdFor(template as 'WZR-BRIEF', 'case'), version: '1.0' })),
    data: { plan_context: { channel: 'LinkedIn', relative_days: '1-30', audience: 'People', topic_count: 2, format: 'text', finished_posts_in_scope: 1, versions: {}, simulation_flag: false }, topics: [topic('TOP01'), topic('TOP02')],
      balance: { pillar_counts: { P1: 2 }, need_stages: 'Need', distinctness: 'Distinct', evidence_diversity: 'Diverse' },
      recommendation: { topic_id: 'TOP01', reason: 'Recommended', evidence_available: [], role: 'Help', readiness: 'ready' },
      selected_topic: { topic_id: null, status: 'awaiting_client', decision_id: null, decision_version: null, decision_text: null, real_approval: false } },
  })
  qa = { id: uuid(20), status: 'done', outputVersionId: version.id, qaResult: { verdict: 'ready_for_approval', readyForApproval: true },
    inputVersions: [...version.inputVersions as unknown[], { document_id: documentIdFor('WZR-PLAN', 'case'), version: '1.0' }] }
  const brief = Object.assign(new AgencyResearchDocument(), { ...scope, orderRef: 'case', id: uuid(11), templateId: 'WZR-BRIEF', deletedAt: null, currentVersionId: uuid(12) })
  const strategy = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: 'case', id: uuid(13), templateId: 'WZR-STRATEGIA', versionNo: 1 })
  const tov = Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: 'case', id: uuid(14), templateId: 'WZR-TOV', versionNo: 1 })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const candidates = entity === AgencyResearchDocument ? [document, brief] : [version, strategy, tov]
    return (candidates.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(findWithDecryption).mockImplementation(async () => [qa] as never)
  jest.mocked(readStrategyPairAcceptance).mockResolvedValue({ status: 'accepted', brief: { versionId: uuid(12), version: '1.0' } } as never)
})
const review = () => readPlanReview(em, scope, { orderRef: 'case', planVersionId: version.id })

test('exact QA-ready parent with draft writer version is reviewable, recommendation is not consent', async () => {
  expect(await review()).toMatchObject({ status: 'ready', recommendedTopicId: 'TOP01', receipt: null })
  expect(flush).not.toHaveBeenCalled()
})
test('records explicit approval and different selected topic without changing plan content/version', async () => {
  const data = version.data
  const result = await acceptPlan(em, input)
  expect(result).toMatchObject({ status: 'plan_accepted', replayed: false, record: { approvePlan: true, selectedTopicId: 'TOP02', documentVersionId: version.id } })
  expect(version.data).toBe(data)
  expect(version.status).toBe('approved')
  expect(await readPlanAcceptance(em, scope, { orderRef: 'case', planVersionId: version.id })).toMatchObject({ status: 'ready', receipt: result.record })
})
test('same source replays without writing; changing its choice conflicts', async () => {
  await acceptPlan(em, input)
  expect(await acceptPlan(em, input)).toMatchObject({ replayed: true })
  await expect(acceptPlan(em, { ...input, request: { ...input.request, selectedTopicId: 'TOP01' } })).rejects.toMatchObject({ status: 409 })
  expect(flush).toHaveBeenCalledTimes(1)
})
test('new explicit source changes one current selection while preserving previous receipt', async () => {
  const first = await acceptPlan(em, input)
  const second = await acceptPlan(em, { ...input, request: { ...input.request, selectedTopicId: 'TOP01', source: { ...input.request.source, submissionId: uuid(30) } } })
  expect(version.approvalRecords).toEqual([first.record, second.record])
  expect(await review()).toMatchObject({ receipt: { selectedTopicId: 'TOP01' } })
})
test('new plan does not inherit old consent; historical replay remains unchanged', async () => {
  const saved = await acceptPlan(em, input)
  document.currentVersionId = uuid(31)
  expect(await review()).toMatchObject({ status: 'not_ready', reason: 'plan_not_current' })
  expect(await acceptPlan(em, input)).toMatchObject({ record: saved.record, replayed: true })
})
test.each(['', 'UNKNOWN'])('rejects missing or foreign topic %s without writing', async (selectedTopicId) => {
  await expect(acceptPlan(em, { ...input, request: { ...input.request, selectedTopicId } })).rejects.toBeDefined()
  expect(flush).not.toHaveBeenCalled()
})
test('stale QA or changed accepted foundation blocks a decision', async () => {
  qa.outputVersionId = uuid(32)
  expect(await review()).toMatchObject({ status: 'not_ready', reason: 'plan_qa_not_ready' })
  qa.outputVersionId = version.id
  jest.mocked(readStrategyPairAcceptance).mockResolvedValue({ status: 'not_ready', orderRef: 'case', reason: 'pair_not_current' })
  expect(await review()).toMatchObject({ status: 'not_ready', reason: 'plan_foundations_not_accepted' })
  expect(flush).not.toHaveBeenCalled()
})
