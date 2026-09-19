import { z } from 'zod'

export const sourceStoryIds = ['F42-2', 'F43-1', 'F43-2', 'F44-2', 'F47-1', 'F57-1', 'F59-1', 'F60-1'] as const

const referenceSchema = z.object({ id: z.string().min(1), version: z.string().min(1) }).strict()

export const inputSchema = z.object({
  submissionId: z.uuid(),
  originalText: z.string(),
  savedTriage: z.object({ decisionId: z.string().min(1), partId: z.string().min(1), summary: z.string().min(1), rationale: z.string().min(1) }).strict(),
  orderId: z.string().min(1),
  offer: z.object({
    reference: referenceSchema,
    brand: z.string().min(1),
    market: z.string().min(1),
    language: z.string().min(1),
    deliverables: z.array(z.object({ kind: z.string().min(1), quantity: z.number().int().positive() }).strict()),
    publicationChannels: z.array(z.string().min(1)),
    boundaries: z.array(z.string().min(1)),
  }).strict(),
  deliveryState: z.enum(['before_delivery', 'delivered']),
  evidence: z.array(z.object({ reference: referenceSchema, text: z.string().min(1) }).strict()),
}).strict()

export const outputSchema = z.object({
  submissionId: z.uuid(),
  triageDecisionId: z.string().min(1),
  partId: z.string().min(1),
  offerReference: referenceSchema,
  recommendation: z.enum(['in_scope', 'clarify', 'outside_scope', 'employee_exception']),
  rationale: z.string().min(1),
  comparison: z.array(z.object({
    dimension: z.enum(['brand', 'market', 'language', 'deliverables', 'publication_channels', 'assumptions']),
    requested: z.string().min(1),
    purchased: z.string().min(1),
    finding: z.string().min(1),
  }).strict()),
  postDeliveryAssessment: z.enum(['not_applicable', 'agency_error', 'new_need', 'undetermined']),
  clarificationQuestion: z.string().min(1).nullable(),
  evidenceReferences: z.array(referenceSchema),
  effectsApplied: z.literal(false),
}).strict()

export type ScopeAssessmentInput = z.infer<typeof inputSchema>
export type ScopeAssessmentOutput = z.infer<typeof outputSchema>
