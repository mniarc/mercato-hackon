import { pakietDataSchema, type PakietData } from '../../../data/schemas/pakiet'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import { closureGateOf, closureReasons, paymentVerifiedOf } from '../packaging'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 9.3 — the closure gate, re-evaluated from the current package (never
 * from a remembered result): payment from purchase, completion, confirmed
 * publication, a real delivery event, no open blockers. The step records the
 * verdict on its task run and mutates nothing — the order state, the delivery
 * date and the link to the payment belong to the spine's `agency.case.close`.
 */

export type ClosureOutcome = StepOutcome & { closeAllowed: boolean; reasons: string[]; gate: PakietData['closure_gate'] }

export async function runClosureStep(ctx: StepContext): Promise<ClosureOutcome> {
  const { em, scope, orderRef } = ctx
  const pakiet = await currentInputVersion(em, scope, orderRef, 'WZR-PAKIET')
  if (!pakiet) throw new Error('[internal] 9.3 needs a current KLI-PAKIET version — run 9.1 first')
  const orderDocument = await currentInputVersion(em, scope, orderRef, 'WZR-ZAMOWIENIE')
  const inputVersions = [ctx.orderVersion, { document_id: pakiet.document_id, version: pakiet.version, status: pakiet.status }]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '9.3', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const data = pakietDataSchema.parse(pakiet.data)
    const gate = closureGateOf({
      paymentVerified: paymentVerifiedOf(orderDocument?.data),
      completion: data.completion_check,
      publicationOutcome: data.publication_receipt_ref.outcome,
      delivery: data.delivery,
    })
    const reasons = closureReasons(gate)
    await finishTaskRun(em, run, {
      status: 'done',
      outputVersionId: pakiet.versionId,
      qaResult: { close_allowed: gate.close_allowed, reasons, gate },
      summary: { close_allowed: gate.close_allowed, reasons, package_version: pakiet.version },
      cost: ctx.ledger.snapshot(),
    })
    ctx.log(`9.3 close_allowed=${gate.close_allowed}${reasons.length ? ` (${reasons.join(', ')})` : ''}`)
    return { taskRunId: run.id, versionId: pakiet.versionId, status: 'done', closeAllowed: gate.close_allowed, reasons, gate }
  } catch (error) {
    await finishTaskRun(em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
