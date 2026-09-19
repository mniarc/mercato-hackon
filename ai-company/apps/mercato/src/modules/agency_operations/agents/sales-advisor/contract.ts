import { z } from 'zod'

export const sourceStoryIds = ['F01-2', 'F40-2', 'F45-1'] as const

export const inputSchema = z.object({
  submissionId: z.string().min(1),
  triageDecisionId: z.string().min(1),
  question: z.string().min(1),
  catalog: z.object({
    versionId: z.string().min(1),
    productId: z.string().min(1),
    content: z.string().min(1),
  }),
})

export const outputSchema = z.object({
  disposition: z.enum(['answer', 'explain_catalog_boundary', 'clarify']),
  message: z.string().min(1),
  catalogVersionId: z.string().min(1),
  supportingCatalogPassages: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
