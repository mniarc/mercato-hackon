import { z } from 'zod'

/**
 * Quality control (3.7 analysis QA, 4.2 brief QA). The verdict is exactly one of
 * three states (F08-2 AC3 / F09-3 AC2); every finding names the gap, its owner
 * and the step that repairs it, so a `to_fix` never passes a faulty document on.
 */

export const qaVerdicts = ['ready', 'to_fix', 'exception'] as const
export const briefQaVerdicts = ['ready_for_approval', 'needs_client_data', 'needs_agent_fix'] as const
export const findingOwners = ['agent', 'client', 'research', 'staff'] as const
export const findingSeverities = ['blocking', 'major', 'minor'] as const
export const findingKinds = [
  'unsourced_claim',
  'fact_vs_interpretation',
  'contradiction',
  'missing_must_field',
  'limit_exceeded',
  'unresolved_reference',
  'quote_not_verbatim',
  'invented_effectiveness',
  /** A deslop catalogue pattern or watched word (style, never a fact); minor/major, the editor confirms. */
  'slop_pattern',
  'other',
] as const

export const qaFindingSchema = z.object({
  code: z.enum(findingKinds),
  /** Where in the document: `WEW-AUDYT.gaps[2]`, `WEW-ZRODLA.facts[F07]`. */
  path: z.string().min(1),
  severity: z.enum(findingSeverities),
  gap: z.string().min(1),
  owner: z.enum(findingOwners),
  /** The author step that repairs it (3.2–3.6, 4.1) or null when the owner is not an agent. */
  fix_step: z.string().nullable(),
  fix_hint: z.string().nullable(),
})
export type QaFinding = z.infer<typeof qaFindingSchema>

export const qaResultSchema = z.object({
  verdict: z.enum(qaVerdicts),
  findings: z.array(qaFindingSchema),
  summary: z.string().min(1),
})
export type QaResult = z.infer<typeof qaResultSchema>
