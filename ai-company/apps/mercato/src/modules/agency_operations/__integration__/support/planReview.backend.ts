// Loaded through Open Mercato's app compiler, never Playwright's TypeScript transform.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { orderOf, brief, strategia, tov, zrodla } from '../../../agency_research/__fixtures__/planJourney'
import { orderDataSchema } from '../../../agency_research/data/schemas/zamowienie'
import { konkurencjaDataSchema } from '../../../agency_research/data/schemas/konkurencja'
import { planDataSchema } from '../../../agency_research/data/schemas/plan'
import { AgencyResearchDocumentVersion } from '../../../agency_research/data/entities'
import type { InputVersion, TemplateId } from '../../../agency_research/data/schemas/envelope'
import { briefAcceptanceRecordSchema } from '../../../agency_research/lib/briefAcceptance/contracts'
import { strategyPairAcceptanceRecordSchema } from '../../../agency_research/lib/strategyPairAcceptance/contracts'
import { documentIdFor } from '../../../agency_research/lib/research/envelope'
import { createLedger } from '../../../agency_research/lib/research/ledger'
import { runPlanStep } from '../../../agency_research/lib/research/steps/plan'
import { runPlanQaLoop } from '../../../agency_research/lib/research/steps/planQa'
import type { StepContext, StrategyExecutionInput } from '../../../agency_research/lib/research/steps/context'
import { createFixtureRunner } from '../../../agency_research/lib/runners'
import { saveDocumentVersion, startTaskRun, finishTaskRun } from '../../../agency_research/lib/store'
import { PLAN_REVIEW_SERVICE, PLAN_REVIEW_WORKFLOW_ID, type PlanReviewService } from '../../lib/planReview/contracts'
import { POST_REVIEW_WORKFLOW_ID } from '../../lib/postReview/contracts'
import { AgencyCase } from '../../data/entities'
import { analysisExecutionPolicySchema } from '../../lib/analysisProcess/contracts'
import { AGENCY_ANALYSIS_WORKFLOW_ID, AGENCY_ANALYSIS_FUNCTION_NAME } from '../../lib/analysisProcess/workflow'
import type { BriefReviewFixture } from './briefReview'

export type PlanReviewFixture = {
  caseId: string; tenantId: string; organizationId: string;
  documentId: string; versionId: string; version: string; selectedTopicId: string; recommendedTopicId: string;
  taskId: string; workflowInstanceId: string;
  documentIds: string[]; versionIds: string[]; taskRunIds: string[];
}

/** Seeded accepted foundations, not a claim that the preceding paid research ran. */
export async function createPlanReviewFixture(input: {
  brief: BriefReviewFixture; userId: string; customerUserId: string;
}): Promise<PlanReviewFixture> {
  const { caseId, tenantId, organizationId } = input.brief
  const scope = { tenantId, organizationId }
  const fixture: PlanReviewFixture = { caseId, ...scope, documentId: '', versionId: '', version: '', selectedTopicId: '', recommendedTopicId: '',
    taskId: '', workflowInstanceId: '', documentIds: [], versionIds: [], taskRunIds: [] }
  const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
  await bootstrapFromAppRoot(appRoot)
  const container = await createRequestContainer()
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const fixtureRoot = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow')
    const canned = path.join(fixtureRoot, 'canned')
    const order = orderOf('LinkedIn')
    const brand = order.brand
    const pins: InputVersion[] = []
    async function save(templateId: TemplateId, data: object, status: 'approved' | 'ready_for_review', inputs = [...pins], clientViewMd = '# Seeded plan foundations') {
      const task = await startTaskRun(em, scope, { orderRef: caseId, brand, stepId: 'demo-plan-foundation', attempt: 1, runner: 'fixture', models: {}, inputVersions: inputs })
      fixture.taskRunIds.push(task.id)
      const saved = await saveDocumentVersion(em, scope, { orderRef: caseId, brand, templateId, status,
        inputVersions: inputs, data: data as Record<string, unknown>, issues: [], renderedMd: clientViewMd, clientViewMd,
        taskRunId: task.id, simulation: false })
      fixture.versionIds.push(saved.version.id)
      if (saved.document.id !== input.brief.documentId) fixture.documentIds.push(saved.document.id)
      await finishTaskRun(em, task, { status: 'done', outputVersionId: saved.version.id, summary: { fixture: 'seeded-plan-foundations' } })
      pins.push({ document_id: documentIdFor(templateId, caseId), version: saved.envelope.version, status })
      return saved
    }
    const savedOrder = await save('WZR-ZAMOWIENIE', orderDataSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'order.json'), 'utf8'))), 'approved')
    const sources = await save('WZR-ZRODLA', zrodla(), 'approved')
    // This lane binds the competitor reference; it does not consume or regenerate its contents.
    const synthesis = JSON.parse(fs.readFileSync(path.join(canned, 'agency_research.competitor_synthesizer.json'), 'utf8')).data
    const competitors = await save('WZR-KONKURENCJA', konkurencjaDataSchema.parse({ selection: [], cards: [], channels: [],
      ...synthesis,
      // Same limit and stable IDs as research/steps/competitors.ts gateSynthesis.
      difference_candidates: synthesis.difference_candidates.slice(0, 3).map((candidate: Record<string, unknown>, index: number) => ({
        candidate_id: `D${String(index + 1).padStart(2, '0')}`, ...candidate,
      })),
    }), 'approved')
    const foundationBrief = await save('WZR-BRIEF', brief(), 'approved', [...pins], input.brief.clientViewMd)
    const source = { submissionId: randomUUID(), eventId: 'seeded-plan-foundations', workflowInstanceId: randomUUID(), agentRunId: randomUUID(), invitationTaskId: randomUUID() }
    foundationBrief.version.approvalRecords = [briefAcceptanceRecordSchema.parse({ person: input.customerUserId, at: new Date().toISOString(), scope: 'brief',
      version: foundationBrief.envelope.version, documentVersionId: foundationBrief.version.id, source: { ...source, kind: 'agency_brief_acceptance' } })]
    const strategy = await save('WZR-STRATEGIA', strategia(), 'approved')
    const voice = await save('WZR-TOV', tov(), 'approved')
    const pair = { strategy: { documentId: strategy.document.id, versionId: strategy.version.id }, tov: { documentId: voice.document.id, versionId: voice.version.id } }
    for (const [kind, saved] of [['strategy', strategy], ['tov', voice]] as const) {
      saved.version.approvalRecords = [strategyPairAcceptanceRecordSchema.parse({ person: input.customerUserId, at: new Date().toISOString(), scope: kind,
        version: saved.envelope.version, documentVersionId: saved.version.id, briefVersionId: foundationBrief.version.id, pair, approvedDocuments: ['strategy', 'tov'],
        source: { ...source, kind: 'agency_strategy_pair_acceptance' } })]
    }
    await em.flush()
    const pairQa = await startTaskRun(em, scope, { orderRef: caseId, brand, stepId: '5.4', attempt: 1, runner: 'fixture', models: {}, inputVersions: [...pins] })
    fixture.taskRunIds.push(pairQa.id)
    await finishTaskRun(em, pairQa, { status: 'done', outputVersionId: strategy.version.id, qaResult: { verdict: 'ready_for_approval' } })
    const runAgent = createFixtureRunner(canned)
    const models = { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }
    const snapshot = (saved: Awaited<ReturnType<typeof save>>): StrategyExecutionInput => ({
      document_id: saved.envelope.document_id, version: saved.envelope.version, status: saved.envelope.status,
      versionId: saved.version.id, data: saved.version.data,
    })
    const planningOutputs: NonNullable<StepContext['planningOutputs']> = { plan: null }
    const context: StepContext = {
      em, scope, orderRef: caseId, order, orderVersion: snapshot(savedOrder), runAgent, runner: 'fixture', models,
      ledger: createLedger({ prices: {} }), onEvent: () => {}, log: (message) => console.log(`[TC-AGENCY-001] ${message}`),
      agentRunIds: [], taskRunIds: fixture.taskRunIds, documentVersionIds: fixture.versionIds, repairFindings: [], attempt: 1,
      fetchPage: async () => { throw new Error('Plan fixture cannot fetch new research') },
      planningInputs: { strategy: snapshot(strategy), tov: snapshot(voice), brief: snapshot(foundationBrief), zrodla: snapshot(sources), konkurencja: snapshot(competitors) },
      planningOutputs,
    }
    await runPlanStep(context)
    const qa = await runPlanQaLoop(context, { planStep: runPlanStep })
    if (qa.verdict !== 'ready_for_approval' || !qa.readyForApproval || !planningOutputs.plan) throw new Error('Existing p6 fixtures must produce a QA-ready plan through the normal repair loop')
    const savedPlan = await em.findOneOrFail(AgencyResearchDocumentVersion, { ...scope, orderRef: caseId, id: qa.planVersionId, templateId: 'WZR-PLAN' })
    const plan = planDataSchema.parse(savedPlan.data)
    fixture.documentId = savedPlan.documentId
    fixture.documentIds.push(savedPlan.documentId)
    fixture.versionId = savedPlan.id
    fixture.version = planningOutputs.plan.version
    fixture.recommendedTopicId = plan.recommendation.topic_id
    const selected = plan.topics.find((topic) => topic.topic_id !== fixture.recommendedTopicId && topic.readiness === 'ready')
    if (!selected) throw new Error('Existing plan fixture requires an explicit nonrecommended topic')
    fixture.selectedTopicId = selected.topic_id
    if (process.env.AGENCY_TEST_NATIVE_POST === '1') {
      // Explicit fixture foundation: real native process/policy reference only.
      // Starting without executing does not claim that the original analysis ran.
      const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
        .findOwnedDefinition(em, { workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, ...scope })
      if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations'
        || definition.metadata.generatedBy.ownerId !== 'analysis') throw new Error('Configure the owned analysis policy before native post proof')
      const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
        .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === AGENCY_ANALYSIS_FUNCTION_NAME)
      const policy = activities.length === 1 ? analysisExecutionPolicySchema.parse(activities[0].config.args?.policy) : null
      if (!policy?.postExecution) throw new Error('Native post proof requires explicitly configured post execution budget')
      const executor = container.resolve<Pick<typeof import('@open-mercato/core/modules/workflows/lib/workflow-executor'), 'startWorkflow'>>('workflowExecutor')
      const analysis = await executor.startWorkflow(em, { ...scope, workflowId: definition.workflowId, version: definition.version,
        correlationKey: `agency-demo-post-foundation:${caseId}`,
        metadata: { entityType: 'agency_operations:agency_case', entityId: caseId, initiatedBy: input.userId,
          labels: { fixture: 'seeded-accepted-foundations-analysis-not-executed' } },
        initialContext: { caseId, fixtureFoundation: 'Accepted research documents seeded; analysis has not executed.' },
      })
      const agencyCase = await em.findOneOrFail(AgencyCase, { ...scope, id: caseId, deletedAt: null })
      agencyCase.workflowInstanceId = analysis.id
      await em.flush()
    }
    const invitation = await container.resolve<PlanReviewService>(PLAN_REVIEW_SERVICE).invite({ caseId, planVersionId: fixture.versionId, ...scope, userId: input.userId })
    fixture.taskId = invitation.taskId
    fixture.workflowInstanceId = invitation.workflowInstanceId
    return fixture
  } catch (error) {
    await deletePlanReviewFixture(fixture)
    throw error
  } finally { await container.dispose() }
}

export async function deletePlanReviewFixture(fixture: PlanReviewFixture): Promise<void> {
  await withClient(async (client) => {
    const scope = [fixture.tenantId, fixture.organizationId]
    const workflows = await client.query<{ id: string }>(
      'SELECT id FROM workflow_instances WHERE tenant_id=$1 AND organization_id=$2 AND ((workflow_id=$3 AND correlation_key=$4) OR (workflow_id=$5 AND correlation_key LIKE $6))',
      [...scope, PLAN_REVIEW_WORKFLOW_ID, `agency-plan:${fixture.caseId}:${fixture.versionId}`, POST_REVIEW_WORKFLOW_ID, `agency-post:${fixture.caseId}:%`])
    for (const { id } of workflows.rows) {
      for (const table of ['workflow_events', 'user_tasks', 'step_instances', 'workflow_branch_instances']) {
        await client.query(`DELETE FROM ${table} WHERE workflow_instance_id=$1 AND tenant_id=$2 AND organization_id=$3`, [id, ...scope])
      }
      await client.query('DELETE FROM workflow_instances WHERE id=$1 AND tenant_id=$2 AND organization_id=$3', [id, ...scope])
    }
    // All rows for this new compiler output belong to this fixture's unique case.
    await client.query("DELETE FROM agency_research_document_versions WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND (id=ANY($4::uuid[]) OR template_id IN ('WZR-PLAN','WZR-ZLECENIE-POSTU','WZR-POST','WZR-ESKALACJA','WZR-KONFIG-PUBLIKACJI','WZR-ZLECENIE-PUBLIKACJI'))", [...scope, fixture.caseId, fixture.versionIds])
    await client.query("DELETE FROM agency_research_task_runs WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND (id=ANY($4::uuid[]) OR step_id IN ('6.2','6.3','6.7','7.1','7.2','7.3','7.7','E.1'))", [...scope, fixture.caseId, fixture.taskRunIds])
    await client.query("DELETE FROM agency_research_documents WHERE tenant_id=$1 AND organization_id=$2 AND order_ref=$3 AND (id=ANY($4::uuid[]) OR template_id IN ('WZR-PLAN','WZR-ZLECENIE-POSTU','WZR-POST','WZR-ESKALACJA','WZR-KONFIG-PUBLIKACJI','WZR-ZLECENIE-PUBLIKACJI'))", [...scope, fixture.caseId, fixture.documentIds])
  })
}
