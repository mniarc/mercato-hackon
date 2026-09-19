import { z } from 'zod'

/**
 * KLI-TOV (WZR-TOV, process 5.3) — the brand's language: four principles, five
 * style axes described by behaviour, wording, evidence language (how a fact, a
 * declaration, a hypothesis, an example and a limit are phrased), three
 * before/after pairs on real facts, context rules and 6–8 yes/no copy checks.
 * The `agency_tov` lane's KLI-TOV (a corpus-derived voice profile) is an optional
 * enrichment; this document is the process contract.
 */

const ids = z.array(z.string().min(1))

export const voicePrincipleSchema = z.object({
  trait: z.string().min(1),
  purpose: z.string().min(1),
  author_behavior: z.string().min(1),
  typical_error: z.string().min(1),
})

export const styleAxisSchema = z.object({
  axis: z.enum(['formality', 'directness', 'technicality', 'humor', 'claim_strength']),
  position: z.string().min(1),
  example: z.string().min(1),
  change_when: z.string().min(1),
})

export const wordingSchema = z.object({
  preferred_in_context: z.array(z.string().min(1)),
  replacements: z.array(z.object({ avoid: z.string().min(1), use: z.string().min(1) })),
  replacement_boundary: z.string().min(1),
  cliches: z.array(z.string().min(1)),
  expert_terms: z.string().min(1),
  sentence_pattern: z.string().min(1),
})

export const evidenceLanguageSchema = z.object({
  type: z.enum(['fact', 'first_party_claim', 'hypothesis', 'illustrative_example', 'limitation']),
  pattern: z.string().min(1),
  forbidden_upgrade: z.string().min(1),
})

export const beforeAfterSchema = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
  changed_principle: z.string().min(1),
  fact_ids: ids,
  /** `grounded` when fact_ids back the content, else `creative_example`. */
  status: z.enum(['grounded', 'creative_example']),
})

export const contextRuleSchema = z.object({
  situation: z.string().min(1),
  tone_and_example: z.string().min(1),
  boundary: z.string().min(1),
})

export const tovDataSchema = z.object({
  voice_principles: z.array(voicePrincipleSchema),
  style_axes: z.array(styleAxisSchema),
  wording: wordingSchema,
  evidence_language: z.array(evidenceLanguageSchema),
  before_after: z.array(beforeAfterSchema),
  context_rules: z.array(contextRuleSchema),
  /** 6–8 yes/no questions an editor can check on a post. */
  copy_checks: z.array(z.string().min(1)),
})
export type TovData = z.infer<typeof tovDataSchema>
