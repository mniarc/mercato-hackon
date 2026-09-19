import { z } from 'zod'

export const sourceStoryIds = ['F06-2', 'F06-3', 'F11-1', 'F44-2', 'F53-1'] as const

export const inputSchema = z.object({
  company: z.string().min(1),
  website: z.string().min(1),
  catalogVersionId: z.string().min(1),
  scope: z.string().min(1),
  suppliedEvidence: z.array(z.object({
    sourceId: z.string().min(1),
    reference: z.string().min(1),
    retrievedAt: z.string().nullable(),
    availability: z.enum(['available', 'unavailable', 'not_retrieved']),
    excerpt: z.string().nullable(),
    provenance: z.string().min(1),
  })),
  requestedSupplement: z.string().nullable(),
})

export const outputSchema = z.object({
  sourceAssessments: z.array(z.object({
    sourceId: z.string().min(1),
    kind: z.enum(['website', 'official_social_candidate', 'other']),
    attribution: z.enum(['supported', 'uncertain', 'unrelated']),
    rationale: z.string().min(1),
    limitations: z.array(z.string()),
  })),
  businessProfile: z.array(z.object({
    statement: z.string().min(1),
    sourceIds: z.array(z.string()),
    knowledgeStatus: z.enum(['fact', 'hypothesis', 'missing']),
  })),
  clarificationQuestions: z.array(z.string()),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
