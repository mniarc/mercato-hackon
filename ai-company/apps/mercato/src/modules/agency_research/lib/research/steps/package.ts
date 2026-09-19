import { AgencyResearchDocumentVersion } from '../../../data/entities'
import type { DocumentIssue, InputVersion, TemplateId } from '../../../data/schemas/envelope'
import type { EskalacjaData } from '../../../data/schemas/eskalacja'
import { pakietDataSchema, type PakietData } from '../../../data/schemas/pakiet'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { buildPackage, notExecutedDelivery, paymentVerifiedOf, type PackageDocumentKey, type PackagedDocument } from '../packaging'
import { renderPakiet, renderPakietClientView } from '../render/pakiet'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 9.1 — completeness check and KLI-PAKIET assembly (no model calls). The
 * package points at the current versions of the purchased results, projects the
 * verified audit findings, names every gap by its responsible deliverable and
 * computes the closure gate. It creates no new findings and no new versions of
 * anything else; sharing (9.2) is the spine's — here `delivery` stays as
 * recorded on the previous package, `not_executed` at first.
 */

const packageDocuments: Record<PackageDocumentKey, TemplateId> = {
  brief: 'WZR-BRIEF',
  strategia: 'WZR-STRATEGIA',
  tov: 'WZR-TOV',
  plan: 'WZR-PLAN',
  post: 'WZR-POST',
  audyt: 'WZR-AUDYT',
  konkurencja: 'WZR-KONKURENCJA',
  zrodla: 'WZR-ZRODLA',
  potwierdzenie: 'WZR-POTWIERDZENIE-PUBLIKACJI',
}

type Loaded = { key: PackageDocumentKey; pinned: InputVersion; document: PackagedDocument }

/** The current version of every package input, with its simulation flag read off the stored version. */
export async function loadPackageInputs(ctx: StepContext): Promise<Loaded[]> {
  const loaded: Loaded[] = []
  for (const [key, templateId] of Object.entries(packageDocuments) as [PackageDocumentKey, TemplateId][]) {
    const current = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, templateId)
    if (!current) continue
    const stored = await ctx.em.findOne(AgencyResearchDocumentVersion, { id: current.versionId })
    loaded.push({
      key,
      pinned: { document_id: current.document_id, version: current.version, status: current.status },
      document: { document_id: current.document_id, version: current.version, status: current.status ?? 'draft', simulation: stored?.simulationFlag ?? false, data: current.data },
    })
  }
  return loaded
}

/** Escalations still waiting for a staff decision block delivery. */
export async function openEscalationRefs(ctx: StepContext): Promise<string[]> {
  const current = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ESKALACJA')
  if (!current) return []
  const data = current.data as Partial<EskalacjaData> | null
  return data?.resolution?.state === 'open' ? [`${current.document_id} v${current.version}`] : []
}

export type PackageOutcome = StepOutcome & { data: PakietData; issues: DocumentIssue[] }

export async function runPackageStep(ctx: StepContext): Promise<PackageOutcome> {
  const { em, scope, orderRef } = ctx
  const loaded = await loadPackageInputs(ctx)
  const orderDocument = await currentInputVersion(em, scope, orderRef, 'WZR-ZAMOWIENIE')
  const previous = await currentInputVersion(em, scope, orderRef, 'WZR-PAKIET')
  const escalations = await openEscalationRefs(ctx)
  const inputVersions: InputVersion[] = [ctx.orderVersion, ...loaded.map((item) => item.pinned), ...(previous ? [{ document_id: previous.document_id, version: previous.version, status: previous.status }] : [])]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '9.1', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const documents = Object.fromEntries(loaded.map((item) => [item.key, item.document])) as Partial<Record<PackageDocumentKey, PackagedDocument>>
    const previousDelivery = previous ? pakietDataSchema.partial().safeParse(previous.data) : null
    const offer = (orderDocument?.data as { product_selection?: { offer_version?: string } } | undefined)?.product_selection
    const built = buildPackage({
      brand: ctx.order.brand,
      sku: ctx.order.sku,
      offerVersion: offer?.offer_version ?? 'unknown',
      outputLanguage: ctx.order.outputLanguage,
      documents,
      paymentVerified: paymentVerifiedOf(orderDocument?.data),
      openEscalationRefs: escalations,
      delivery: previousDelivery?.success ? (previousDelivery.data.delivery ?? notExecutedDelivery) : notExecutedDelivery,
    })
    const issues = [...built.issues]
    const simulated = simulationIssue(inputVersions)
    if (simulated) issues.push(simulated)
    const view = renderPakietClientView({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: built.data })
    if (view.issue) issues.push(view.issue)
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-PAKIET',
      status: built.data.completion_check.state === 'complete' ? 'ready_for_review' : 'draft',
      inputVersions,
      data: built.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderPakiet({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: built.data, issues }),
      clientViewMd: view.markdown,
      taskRunId: run.id,
      simulation: simulated !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(em, run, {
      status: 'done',
      outputVersionId: saved.version.id,
      summary: { completion: built.data.completion_check.state, blockers: built.data.completion_check.blockers, close_allowed: built.data.closure_gate.close_allowed, publication: built.data.publication_receipt_ref.outcome },
      cost: ctx.ledger.snapshot(),
    })
    ctx.log(`9.1 package ${built.data.completion_check.state}: ${built.data.completion_check.blockers.length} blockers`)
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done', data: built.data, issues }
  } catch (error) {
    await finishTaskRun(em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
