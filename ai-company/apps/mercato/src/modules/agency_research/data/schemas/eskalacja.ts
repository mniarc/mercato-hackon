import { z } from 'zod'

/**
 * WEW-ESKALACJA (WZR-ESKALACJA, E.1–E.3) — a staff-resolvable exception with
 * evidence, an owner (or an explicit unassigned queue), the exact hold, one
 * decision question and the allowed resolutions; resumption is exactly once.
 * "Powód podaje obserwowany problem, a nie ogólne „AI nie wie”."
 */

export const exceptionCodes = [
  'scope_dispute',
  'source_conflict',
  'integration_failure',
  'publication_unknown',
  'invalid_state',
  'budget_exhausted',
  'qa_exhausted',
  'agent_unavailable',
] as const

export const eskalacjaDataSchema = z.object({
  exception_type: z.object({ code: z.enum(exceptionCodes), summary: z.string().min(1), trigger_step: z.string().min(1) }),
  evidence: z.array(z.object({ ref: z.string().min(1), fact: z.string().min(1), occurred_at_or_unknown: z.string().min(1) })),
  assignment: z.object({
    role: z.string().min(1),
    employee_id_or_unassigned: z.string().min(1),
    queue: z.string().min(1),
    assigned_at_or_null: z.string().nullable(),
  }),
  hold: z.object({
    blocked_task_refs: z.array(z.string()),
    independent_task_refs: z.array(z.string()),
    external_action_lock: z.boolean(),
  }),
  decision_question: z.string().min(1).max(400),
  allowed_resolutions: z.array(z.object({ code: z.string().min(1), required_evidence: z.string().min(1), permitted_next_step: z.string().min(1) })),
  resolution: z.object({
    state: z.enum(['open', 'decided', 'kept_blocked']),
    selected_code_or_null: z.string().nullable(),
    actor_ref_or_null: z.string().nullable(),
    rationale_or_null: z.string().nullable(),
    evidence_refs: z.array(z.string()),
  }),
  resume: z.object({
    next_step_or_null: z.string().nullable(),
    gates: z.array(z.string()),
    state: z.enum(['pending', 'resumed', 'blocked']),
    resume_event_ref_or_null: z.string().nullable(),
  }),
  client_update: z.object({ needed: z.boolean(), message_or_null: z.string().nullable(), delivery_ref_or_null: z.string().nullable() }),
})
export type EskalacjaData = z.infer<typeof eskalacjaDataSchema>
