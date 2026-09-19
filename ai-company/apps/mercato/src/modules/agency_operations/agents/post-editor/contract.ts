import { z } from 'zod'

export const sourceStoryIds = ['F31-1', 'F31-2'] as const

const versionReferenceSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
})
const documentSchema = z.object({ reference: versionReferenceSchema, content: z.string().min(1) })
const evidenceSchema = z.object({ sourceId: z.string().min(1), content: z.string().min(1) })
const researchReturnReferenceSchema = z.object({
  qaTaskId: z.string().min(1),
  postVersion: versionReferenceSchema,
  returnStep: z.literal('7.3'),
})

export const inputSchema = z.object({
  qaTaskId: z.string().min(1),
  post: documentSchema,
  instruction: documentSchema,
  strategy: documentSchema,
  toneOfVoice: documentSchema,
  channelRequirements: z.array(z.string().min(1)),
  evidence: z.array(evidenceSchema),
  technicalFindings: z.array(z.object({ check: z.string().min(1), passed: z.boolean(), evidence: z.string().min(1) })),
  researchReturn: z.object({
    researchTaskId: z.string().min(1),
    correlation: researchReturnReferenceSchema,
    claim: z.string().min(1),
    evidence: z.array(evidenceSchema),
    limitations: z.array(z.string().min(1)),
  }).nullable(),
})

export const outputSchema = z.object({
  qaTaskId: z.string().min(1),
  postVersion: versionReferenceSchema,
  disposition: z.enum(['pass', 'revise_post', 'request_evidence', 'clarify_foundation', 'escalate']),
  rationale: z.string().min(1),
  findings: z.array(z.object({
    area: z.enum(['instruction', 'facts', 'tone_of_voice', 'strategy', 'channel', 'links', 'mentions']),
    description: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  })),
  corrections: z.array(z.object({ text: z.string().min(1), requestedChange: z.string().min(1) })),
  researchRequests: z.array(z.object({
    claim: z.string().min(1),
    neededEvidence: z.string().min(1),
    responsibleProcess: z.literal('3'),
    correlation: researchReturnReferenceSchema,
  })),
  foundationQuestion: z.object({
    affectedVersions: z.array(versionReferenceSchema).min(1),
    contradiction: z.string().min(1),
    question: z.string().min(1),
  }).nullable(),
})

export type PostEditorInput = z.infer<typeof inputSchema>
export type PostEditorOutput = z.infer<typeof outputSchema>
