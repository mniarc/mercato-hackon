import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import { zleceniePublikacjiDataSchema } from '../../../data/schemas/zleceniePublikacji'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { buildPublicationConfirmation } from '../publication'
import { renderPotwierdzeniePublikacji, renderPotwierdzeniePublikacjiClientView } from '../render/potwierdzeniePublikacji'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 8.7 — WEW-POTWIERDZENIE-PUBLIKACJI for the one attempt this lane can
 * account for: none. The record says `not_executed`, names the unmet gates,
 * forbids retry until they are met, and leaves every external field null —
 * an id, a URL or a timestamp only ever comes from a real platform response.
 */

export async function runPublicationConfirmationStep(ctx: StepContext): Promise<StepOutcome> {
  const { em, scope, orderRef } = ctx
  const order = await currentInputVersion(em, scope, orderRef, 'WZR-ZLECENIE-PUBLIKACJI')
  if (!order) throw new Error('[internal] 8.7 needs a current WEW-ZLECENIE-PUBLIKACJI version — run the process through 8.3 first')
  const config = await currentInputVersion(em, scope, orderRef, 'WZR-KONFIG-PUBLIKACJI')
  const post = await currentInputVersion(em, scope, orderRef, 'WZR-POST')
  const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(order), ...(config ? [pin(config)] : []), ...(post ? [pin(post)] : [])]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '8.7', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const lang = ctx.order.outputLanguage
    const orderData = zleceniePublikacjiDataSchema.parse(order.data)
    const data = buildPublicationConfirmation({ order: orderData, orderRef: pin(order) }, lang)
    const issues: DocumentIssue[] = [
      { code: 'PUBLICATION_NOT_EXECUTED', severity: 'blocking_closure', detail: data.failure_details.sanitized_message_or_null ?? data.outcome, path: 'outcome' },
    ]
    const simulated = simulationIssue(inputVersions)
    if (simulated) issues.push({ ...simulated, path: 'approved_material_ref' })
    const view = renderPotwierdzeniePublikacjiClientView({ outputLanguage: lang, brand: ctx.order.brand, data })
    if (view.issue) issues.push(view.issue)
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-POTWIERDZENIE-PUBLIKACJI',
      status: 'blocked',
      inputVersions,
      data: data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderPotwierdzeniePublikacji({ outputLanguage: lang, brand: ctx.order.brand, data, issues }),
      clientViewMd: view.markdown,
      taskRunId: run.id,
      simulation: simulated !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id, summary: { outcome: data.outcome, failure_code: data.failure_details.code_or_null, retry_allowed: data.recovery.retry_allowed }, cost: ctx.ledger.snapshot() })
    ctx.log(`8.7 publication outcome ${data.outcome} (${data.failure_details.code_or_null})`)
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
