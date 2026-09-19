import { eskalacjaDataSchema, type EskalacjaData, type exceptionCodes } from '../../data/schemas/eskalacja'
import type { InputVersion } from '../../data/schemas/envelope'
import { finishTaskRun, saveDocumentVersion, startTaskRun } from '../store'
import { renderEskalacja } from './render/eskalacja'
import type { StepContext } from './steps/context'

/**
 * E.1 — open a staff-resolvable exception. The record carries the observed
 * problem, the evidence, an explicit unassigned queue (an agent never impersonates
 * an employee), the exact hold, one decision question (≤ 400 chars) and the
 * resolutions the employee may pick; resumption (E.3) happens exactly once and
 * never restarts the order.
 */

export type ExceptionCode = (typeof exceptionCodes)[number]

export type EscalationInput = {
  code: ExceptionCode
  summary: string
  triggerStep: string
  evidence: { ref: string; fact: string; occurredAt?: string | null }[]
  /** Steps that must not run until the decision. */
  blockedSteps: string[]
  /** Steps that may continue. */
  independentSteps?: string[]
  decisionQuestion: string
  allowedResolutions: { code: string; requiredEvidence: string; permittedNextStep: string }[]
  /** Where E.3 resumes after a decision, or null when the decision decides that. */
  resumeStep: string | null
  clientUpdateNeeded?: boolean
}

export const ESCALATION_QUEUE = 'agency_research.exceptions'

/** Pure: the WEW-ESKALACJA data for an exception, validated against the contract. */
export function buildEscalation(input: EscalationInput, now: Date = new Date()): EskalacjaData {
  const question = input.decisionQuestion.length > 400 ? `${input.decisionQuestion.slice(0, 399)}…` : input.decisionQuestion
  return eskalacjaDataSchema.parse({
    exception_type: { code: input.code, summary: input.summary, trigger_step: input.triggerStep },
    evidence: input.evidence.map((e) => ({ ref: e.ref, fact: e.fact, occurred_at_or_unknown: e.occurredAt ?? now.toISOString() })),
    assignment: { role: 'agency_research.exceptions.owner', employee_id_or_unassigned: 'unassigned', queue: ESCALATION_QUEUE, assigned_at_or_null: null },
    hold: { blocked_task_refs: input.blockedSteps, independent_task_refs: input.independentSteps ?? [], external_action_lock: false },
    decision_question: question,
    allowed_resolutions: input.allowedResolutions.map((r) => ({ code: r.code, required_evidence: r.requiredEvidence, permitted_next_step: r.permittedNextStep })),
    resolution: { state: 'open', selected_code_or_null: null, actor_ref_or_null: null, rationale_or_null: null, evidence_refs: [] },
    resume: { next_step_or_null: input.resumeStep, gates: [], state: 'pending', resume_event_ref_or_null: null },
    client_update: { needed: input.clientUpdateNeeded ?? false, message_or_null: null, delivery_ref_or_null: null },
  })
}

/** The resolutions a QA exhaustion allows: rerun the author step with staff guidance, accept with an explicit limit, or keep the block. */
export function qaExhaustedResolutions(fixStep: string): EscalationInput['allowedResolutions'] {
  return [
    { code: 'rerun_with_guidance', requiredEvidence: 'A note naming which finding was misjudged or what the author step must do differently.', permittedNextStep: fixStep },
    { code: 'accept_with_explicit_limit', requiredEvidence: 'The finding recorded as a limitation on the document, visible to the next stage.', permittedNextStep: '3.8' },
    { code: 'keep_blocked', requiredEvidence: 'The reason the order cannot proceed and who must act.', permittedNextStep: 'none' },
  ]
}

export function budgetExhaustedResolutions(step: string): EscalationInput['allowedResolutions'] {
  return [
    { code: 'raise_cap_and_resume', requiredEvidence: 'An internal decision on the new per-run cap (STD-LIMITY: no automatic client surcharge).', permittedNextStep: step },
    { code: 'narrow_scope_and_resume', requiredEvidence: 'Which pages or competitors are dropped for this run.', permittedNextStep: step },
    { code: 'keep_blocked', requiredEvidence: 'The reason and who must act.', permittedNextStep: 'none' },
  ]
}

/** DB: stores the WEW-ESKALACJA version and an `E.1` task run in `exception`. */
export async function openEscalation(ctx: StepContext, input: EscalationInput, inputVersions: InputVersion[] = []): Promise<{ versionId: string; taskRunId: string; data: EskalacjaData }> {
  const { em, scope, orderRef } = ctx
  const data = buildEscalation(input)
  const run = await startTaskRun(em, scope, { orderRef, brand: ctx.order.brand, stepId: 'E.1', attempt: 1, runner: 'system', models: {}, inputVersions: [ctx.orderVersion, ...inputVersions] })
  ctx.taskRunIds.push(run.id)
  const saved = await saveDocumentVersion(em, scope, {
    orderRef,
    brand: ctx.order.brand,
    templateId: 'WZR-ESKALACJA',
    status: 'blocked',
    inputVersions: [ctx.orderVersion, ...inputVersions],
    data: data as unknown as Record<string, unknown>,
    issues: [{ code: input.code.toUpperCase(), severity: 'exception', detail: input.summary, path: 'exception_type' }],
    renderedMd: renderEskalacja({ brand: ctx.order.brand, data }),
    clientViewMd: renderEskalacja({ brand: ctx.order.brand, data, clientView: true }),
    taskRunId: run.id,
  })
  ctx.documentVersionIds.push(saved.version.id)
  await finishTaskRun(em, run, { status: 'exception', outputVersionId: saved.version.id, summary: { code: input.code, trigger_step: input.triggerStep, blocked: input.blockedSteps }, cost: ctx.ledger.snapshot(), error: input.summary })
  ctx.onEvent({ type: 'gate', step: 'E.1', section: input.code, kept: 0, dropped: 0, issues: [] })
  return { versionId: saved.version.id, taskRunId: run.id, data }
}
