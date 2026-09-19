import { z } from 'zod'

// Prompt v2 roles 37–39. Result shapes follow the prompt text; every
// approval/publication flag is a literal `false` so no schema-valid answer can
// ever read as a client decision.

const nonEmpty = z.string().min(1)
const list = z.array(nonEmpty)

export const auditSeverities = ['critical', 'major', 'minor'] as const
export const auditDefectTypes = ['execution_error', 'prompt_defect', 'contract_or_code_defect', 'missing_client_decision'] as const
export const auditCheckStates = ['pass', 'fail', 'not_checked', 'not_applicable', 'unverified'] as const
export const auditVerdicts = ['pass', 'repair', 'escalated', 'unverified'] as const

export const liveAuditorInputSchema = z.object({
  run_id: nonEmpty,
  agent_id: nonEmpty,
  stage: nonEmpty,
  attempt: z.number().int().min(0),
  max_repairs: z.number().int().min(0).default(2),
  input_snapshot: z.unknown(),
  output_snapshot: z.unknown(),
  agent_prompt: z.string(),
  prompt_version: nonEmpty,
  prompt_hash: nonEmpty,
  output_contract: z.unknown(),
  validator_results: z.array(z.object({ name: nonEmpty, status: z.enum(['pass', 'fail']), detail: z.string().nullable() })),
  upstream_audit_refs: list.default([]),
  previous_findings: z.array(z.unknown()).default([]),
  client_view: z.object({ version: nonEmpty, hash: z.string().nullable(), markdown: z.string() }).nullable().optional(),
})
export type LiveAuditorInput = z.infer<typeof liveAuditorInputSchema>

export const auditFindingSchema = z.object({
  path: nonEmpty,
  observation: nonEmpty,
  input_premise: z.string().nullable(),
  violated_rule: nonEmpty,
  impact: nonEmpty,
  severity: z.enum(auditSeverities),
  defect_type: z.enum(auditDefectTypes),
  repair_owner: nonEmpty,
  acceptance_condition: nonEmpty,
  repair_prompt: z.string().nullable(),
  proposed_prompt_patch: z.object({ replace: z.string().nullable(), add_after: z.string().nullable(), rationale: nonEmpty, regression_case: nonEmpty }).nullable(),
  integration_fix_required: z.boolean(),
})
export const liveAuditorResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    verdict: z.enum(auditVerdicts),
    checks: z.array(z.object({ name: nonEmpty, status: z.enum(auditCheckStates), note: z.string().nullable() })),
    findings: z.array(auditFindingSchema),
    safe_partial_result: z.string().nullable(),
    client_approval_granted: z.literal(false),
    publication_authorized: z.literal(false),
  }),
})

export const onboardingAnswerOrigins = ['provided_client_answer', 'observed_public_information', 'synthetic_assumption'] as const
export const syntheticOnboardingInputSchema = z.object({
  company_context: z.unknown(),
  source_register: z.unknown(),
  facts: z.unknown(),
  onboarding_definition: z.unknown(),
  provided_client_answers: z.array(z.object({ question_id: nonEmpty, value: z.unknown(), ref: z.string().nullable() })).default([]),
  outputLanguage: z.enum(['pl', 'en']).default('pl'),
})
export const syntheticOnboardingResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    simulation_flag: z.literal(true),
    respondent_type: z.literal('synthetic_client'),
    answers: z.array(z.object({
      question_id: nonEmpty,
      value: z.unknown(),
      origin: z.enum(onboardingAnswerOrigins),
      confidence: z.enum(['high', 'medium', 'low']),
      reason: nonEmpty,
      source_ids: list,
      requires_real_client_confirmation: z.boolean(),
    })),
    assumption_summary: list.max(8),
    unknowns: list,
    inconsistencies: list,
    confirmation_priority: list.max(5),
    form_issue: z.string().nullable(),
    client_approval_granted: z.literal(false),
    publication_authorized: z.literal(false),
  }),
})

export const syntheticReviewVerdicts = ['ready_for_real_client_review', 'revision_needed', 'insufficient_context'] as const
const score = z.object({ score: z.number().int().min(1).max(5), reason: nonEmpty })
export const syntheticReviewInputSchema = z.object({
  company_context: z.unknown(),
  synthetic_onboarding: z.unknown().nullable(),
  documents: z.array(z.object({ document_id: nonEmpty, version: nonEmpty, client_view_md: nonEmpty })).min(1),
  previous_round: z.unknown().nullable().default(null),
  outputLanguage: z.enum(['pl', 'en']).default('pl'),
})
export const syntheticReviewResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    reviewer_type: z.literal('synthetic_client'),
    simulation_flag: z.literal(true),
    real_client_endorsement: z.literal(false),
    documents_read: z.array(z.object({ document_id: nonEmpty, version: nonEmpty })),
    verdict: z.enum(syntheticReviewVerdicts),
    first_impression: nonEmpty,
    scores: z.object({ company_recognition: score, audience_fit: score, choice_clarity: score, usefulness: score, credibility: score, decision_ease: score }),
    changes_required: z.array(z.object({ document_id: nonEmpty, problem: nonEmpty, impact: nonEmpty, proposed_fix: nonEmpty, acceptance_condition: nonEmpty })).max(5),
    what_to_keep: list.max(3),
    questions_to_real_client: z.array(z.object({ question: nonEmpty, options: list.min(1) })).max(3),
    limits_of_simulation: list,
    readable_summary: nonEmpty,
  }),
})
