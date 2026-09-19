import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { buildPublicationConfig } from '../publication'
import { renderKonfigPublikacji, renderKonfigPublikacjiClientView } from '../render/konfigPublikacji'
import type { StepContext, StepOutcome } from './context'

/**
 * Step 8.2 — WEW-KONFIG-PUBLIKACJI: the exact place and access, as far as the
 * order can prove them. Code only. A profile URL from the order is a public
 * address, not an id; a connection reference (never a secret) may come from the
 * environment; validation is never executed by publishing anything. Readiness
 * `ready` needs ids, a connection and a verified check — in this lane the
 * document records the blockers and who acts on them.
 */

export const PUBLICATION_CONNECTION_REF_ENV = 'OM_AGENCY_RESEARCH_PUBLICATION_CONNECTION_REF'

export async function runPublicationConfigStep(ctx: StepContext): Promise<StepOutcome> {
  const { em, scope, orderRef } = ctx
  const previous = await currentInputVersion(em, scope, orderRef, 'WZR-KONFIG-PUBLIKACJI')
  const pin = (v: InputVersion & { versionId: string }): InputVersion => ({ document_id: v.document_id, version: v.version, status: v.status })
  const inputVersions: InputVersion[] = [ctx.orderVersion, ...(previous ? [pin(previous)] : [])]
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: '8.2', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const lang = ctx.order.outputLanguage
    const connectionRef = process.env[PUBLICATION_CONNECTION_REF_ENV] ?? null
    const { data, blockers } = buildPublicationConfig({ order: ctx.order, connectionRef }, lang)
    const issues: DocumentIssue[] = blockers.map((blocker) => {
      const [code, ...rest] = blocker.split(': ')
      return { code, severity: 'blocking_publication', detail: rest.join(': '), path: 'readiness.blockers' }
    })
    const view = renderKonfigPublikacjiClientView({ outputLanguage: lang, brand: ctx.order.brand, data })
    if (view.issue) issues.push(view.issue)
    const saved = await saveDocumentVersion(em, scope, {
      orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-KONFIG-PUBLIKACJI',
      status: data.readiness.state === 'ready' ? 'ready_for_review' : 'blocked',
      inputVersions,
      data: data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderKonfigPublikacji({ outputLanguage: lang, brand: ctx.order.brand, data, issues }),
      clientViewMd: view.markdown,
      taskRunId: run.id,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(em, run, { status: 'done', outputVersionId: saved.version.id, summary: { readiness: data.readiness.state, blockers: blockers.map((b) => b.split(': ')[0]), adapter: data.platform.adapter_id }, cost: ctx.ledger.snapshot() })
    ctx.log(`8.2 publication configuration ${data.readiness.state} (${blockers.length} blockers)`)
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
