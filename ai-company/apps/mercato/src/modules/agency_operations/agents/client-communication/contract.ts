import { z } from 'zod'

export const sourceStoryIds = [
  'F10-1', 'F10-2', 'F24-1', 'F27-2', 'F32-1', 'F34-2', 'F35-1', 'F38-3',
  'F38-4', 'F40-1', 'F41-1', 'F45-1', 'F49-2', 'F53-1', 'F57-1', 'F58-1',
] as const

const referenceSchema = z.object({ id: z.string().min(1), version: z.string().min(1).nullable() }).strict()

export const inputSchema = z.object({
  caseId: z.uuid(),
  submissionId: z.uuid().nullable(),
  originalText: z.string().nullable(),
  savedDisposition: z.object({
    decisionId: z.string().min(1),
    triageDecisionId: z.string().min(1).nullable(),
    kind: z.enum(['answer', 'clarify', 'refuse_extension', 'change', 'approve', 'hold', 'escalate', 'review_invitation', 'delivery']),
    clientSafeExplanation: z.string().min(1),
  }).strict(),
  language: z.string().min(1),
  clientSafeFacts: z.array(z.object({ reference: referenceSchema, text: z.string().min(1) }).strict()),
  requestedClientAction: z.string().min(1).nullable(),
  visibleArtifacts: z.array(z.object({ reference: referenceSchema, title: z.string().min(1), url: z.string().url().nullable() }).strict()),
}).strict()

export const outputSchema = z.object({
  caseId: z.uuid(),
  submissionId: z.uuid().nullable(),
  dispositionDecisionId: z.string().min(1),
  triageDecisionId: z.string().min(1).nullable(),
  status: z.enum(['draft', 'insufficient_grounding']),
  draftText: z.string().min(1).nullable(),
  usedReferences: z.array(referenceSchema),
  missingInformation: z.array(z.string().min(1)),
  sent: z.literal(false),
  effectsApplied: z.literal(false),
}).strict()

export type ClientCommunicationInput = z.infer<typeof inputSchema>
export type ClientCommunicationOutput = z.infer<typeof outputSchema>
