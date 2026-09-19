import type { InputVersion } from '../../../data/schemas/envelope'
import { planDataSchema, type PlanData } from '../../../data/schemas/plan'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { resolveId } from '../ids'
import { renderPlan, renderPlanClientView } from '../render/plan'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 6.5 / 6.6 — the plan decision, recorded without a model. A topic id the
 * caller passes (`ctx.selectedTopicId`, from the client's answer through G) is
 * validated against the current plan version: an id not in this version stops
 * the instruction (`topic_not_in_plan`) — the system never picks at random. With
 * no id, the recommendation becomes a `simulated_selection` with
 * `real_approval: false`; a `client_selected` status requires the plan to be
 * approved and an explicit decision reference — never granted by this lane.
 */

const T = {
  pl: {
    simulated: (topic: string) => `Symulowany wybór ${topic} zgodnie z rekomendacją; brak decyzji klienta. Produkcja postu odbywa się w symulacji.`,
    client: (topic: string) => `Klient wskazał ${topic} w bieżącej wersji planu.`,
    provisional: (topic: string) => `Wskazanie ${topic} przekazane przez system; plan nie ma jeszcze zapisu akceptacji, więc wybór pozostaje symulowany.`,
  },
  en: {
    simulated: (topic: string) => `Simulated selection of ${topic} per the recommendation; no client decision. The post is produced in simulation.`,
    client: (topic: string) => `The client selected ${topic} in the current plan version.`,
    provisional: (topic: string) => `${topic} was passed by the system; the plan carries no approval record yet, so the selection stays simulated.`,
  },
} as const

export type SelectionInput = { plan: PlanData; planApproved: boolean; selectedTopicId: string | null; decisionId?: string | null; outputLanguage: 'pl' | 'en' }

export type SelectionResult = { data: PlanData; status: 'done' | 'to_fix'; error: string | null }

/** Pure: the plan with `selected_topic` filled, or `topic_not_in_plan`. */
export function applySelection(input: SelectionInput): SelectionResult {
  const { plan, outputLanguage } = input
  const t = T[outputLanguage]
  const topicIds = plan.topics.map((topic) => topic.topic_id)
  if (input.selectedTopicId) {
    const resolved = resolveId(input.selectedTopicId, topicIds)
    if (!resolved) return { data: plan, status: 'to_fix', error: `topic_not_in_plan: ${input.selectedTopicId} is not a topic of this plan version` }
    const real = input.planApproved && Boolean(input.decisionId)
    return {
      data: {
        ...plan,
        selected_topic: {
          topic_id: resolved,
          status: real ? 'client_selected' : 'simulated_selection',
          decision_id: input.decisionId ?? null,
          decision_version: null,
          decision_text: real ? t.client(resolved) : t.provisional(resolved),
          real_approval: real,
        },
      },
      status: 'done',
      error: null,
    }
  }
  const recommended = resolveId(plan.recommendation.topic_id, topicIds)
  if (!recommended) return { data: plan, status: 'to_fix', error: `topic_not_in_plan: recommendation ${plan.recommendation.topic_id} is not a topic of this plan version` }
  return {
    data: {
      ...plan,
      selected_topic: { topic_id: recommended, status: 'simulated_selection', decision_id: null, decision_version: null, decision_text: t.simulated(recommended), real_approval: false },
    },
    status: 'done',
    error: null,
  }
}

/** Records the selection as a new KLI-PLAN version pinned to the previous one; the document status is unchanged. */
export async function runSelectionStep(ctx: StepContext): Promise<StepOutcome> {
  const previous = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-PLAN')
  if (!previous) throw new Error('[internal] 6.5 needs a current KLI-PLAN version — run 6.2 / 6.3 first')
  const pinned: InputVersion = { document_id: previous.document_id, version: previous.version, status: previous.status }
  const inputVersions = [ctx.orderVersion, pinned]
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '6.5', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const plan = planDataSchema.parse(previous.data)
    const result = applySelection({ plan, planApproved: previous.status === 'approved', selectedTopicId: ctx.selectedTopicId ?? null, outputLanguage: ctx.order.outputLanguage })
    if (result.status === 'to_fix') {
      ctx.log(`6.5: ${result.error}`)
      await finishTaskRun(ctx.em, run, { status: 'to_fix', outputVersionId: previous.versionId, error: result.error, cost: ctx.ledger.snapshot() })
      return { taskRunId: run.id, versionId: null, status: 'to_fix' }
    }
    const simulation = simulationIssue(inputVersions)
    const issues = simulation ? [simulation] : []
    const status = previous.status === 'approved' ? 'approved' : previous.status === 'ready_for_review' ? 'ready_for_review' : 'draft'
    const view = renderPlanClientView({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data })
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-PLAN',
      status,
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderPlan({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      clientViewMd: view.markdown,
      taskRunId: run.id,
      simulation: result.data.selected_topic.status !== 'client_selected' || simulation !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { selected_topic: result.data.selected_topic }, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
