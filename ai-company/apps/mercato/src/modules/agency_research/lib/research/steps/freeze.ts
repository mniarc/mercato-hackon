import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../../data/entities'
import type { InputVersion, TemplateId } from '../../../data/schemas/envelope'
import type { QaResult } from '../../../data/schemas/qa'
import { currentInputVersion, finishTaskRun, startTaskRun } from '../../store'
import { sha256 } from '../util'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 3.8 — hand over the verified analysis to the brief: freeze the exact
 * version set (O-3.8) after a positive 3.7, idempotently for the same order and
 * set. Signals readiness for 4.1; starts neither strategy nor post; no client
 * approval involved. After a 4.5 supplement the set is refreshed and the same
 * 4.1 execution resumes (F08-3 AC4).
 */

export const frozenTemplates: TemplateId[] = ['WZR-ZRODLA', 'WZR-AUDYT', 'WZR-KONKURENCJA', 'WZR-USTALENIA']

/** Pure: the identity of a version set — order and versions, nothing else. */
export function freezeSetHash(versions: InputVersion[]): string {
  const canonical = [...versions].map((v) => `${v.document_id}@${v.version}`).sort().join('|')
  return sha256(canonical).slice(0, 16)
}

export type FreezeOutcome = StepOutcome & { setHash: string; frozen: InputVersion[]; reused: boolean }

export async function runFreezeStep(ctx: StepContext): Promise<FreezeOutcome> {
  const { em, scope, orderRef } = ctx
  const latestQa = await em.findOne(AgencyResearchTaskRun, { ...scope, orderRef, stepId: '3.7' }, { orderBy: { createdAt: 'desc' } })
  const verdict = (latestQa?.qaResult as QaResult | null)?.verdict
  if (!latestQa || latestQa.status !== 'done' || verdict !== 'ready') {
    throw new Error(`[internal] 3.8 needs a positive 3.7 result for this order (latest: ${latestQa ? `${latestQa.status}/${verdict ?? 'no verdict'}` : 'none'})`)
  }
  const pinned: InputVersion[] = []
  for (const templateId of frozenTemplates) {
    const current = await currentInputVersion(em, scope, orderRef, templateId)
    if (current) pinned.push({ document_id: current.document_id, version: current.version, status: current.status })
  }
  if (!pinned.some((v) => v.document_id.startsWith('WEW-USTALENIA@'))) throw new Error('[internal] 3.8 needs a WEW-USTALENIA version to freeze')
  const setHash = freezeSetHash(pinned)
  const existing = await em.find(AgencyResearchTaskRun, { ...scope, orderRef, stepId: '3.8', status: 'done' }, { orderBy: { createdAt: 'desc' } })
  const same = existing.find((run) => (run.summary as { set_hash?: string } | null)?.set_hash === setHash)
  if (same) {
    ctx.log(`3.8 already frozen this set (${setHash}); reusing task run ${same.id}`)
    return { taskRunId: same.id, versionId: null, status: 'done', setHash, frozen: pinned, reused: true }
  }
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '3.8', attempt: existing.length + 1, runner: 'system', models: {}, inputVersions: [ctx.orderVersion, ...pinned] })
  ctx.taskRunIds.push(run.id)
  // The only mutation this step makes: the frozen documents are ready for the brief's review.
  for (const templateId of frozenTemplates) {
    const document = await em.findOne(AgencyResearchDocument, { ...scope, orderRef, templateId, deletedAt: null })
    if (document && document.status !== 'approved') document.status = 'ready_for_review'
  }
  await em.flush()
  await finishTaskRun(em, run, { status: 'done', summary: { frozen: true, set_hash: setHash, qa_task_run_id: latestQa.id, documents: pinned.map((v) => v.document_id) } })
  ctx.log(`3.8 frozen ${pinned.length} documents (${setHash})`)
  return { taskRunId: run.id, versionId: null, status: 'done', setHash, frozen: pinned, reused: false }
}
