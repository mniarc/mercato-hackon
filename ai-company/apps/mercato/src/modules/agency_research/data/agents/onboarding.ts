import { z } from 'zod'

/**
 * Prompt v2: what the client (or an explicitly synthetic respondent) answered on
 * onboarding, handed to the audit mapper, competitor selector, field mapper and
 * question writer as `onboarding_context`. A `client` answer may become a
 * `client_answer` in the field map; a `synthetic` one only ever a hypothesis.
 */
export const onboardingAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  /** Where the answer came from (form submission id, message id); null for synthetic answers. */
  ref: z.string().nullable(),
})
export const onboardingContextSchema = z.object({
  provenance: z.enum(['client', 'synthetic']),
  answers: z.array(onboardingAnswerSchema),
  /** Competitor or example URLs the respondent named; the selector prefers them but never invents them. */
  competitor_urls: z.array(z.string().min(1)).default([]),
})
export type OnboardingContext = z.infer<typeof onboardingContextSchema>
