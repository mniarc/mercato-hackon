import { z } from 'zod'

export const sourceStoryIds = ['F07-1', 'F11-1', 'F11-2', 'F44-2'] as const

export const inputSchema = z.object({
  sourceRegisterVersionId: z.string().min(1),
  auditTemplateVersionId: z.string().min(1),
  criteria: z.array(z.object({ id: z.string().min(1), description: z.string().min(1) })),
  evidence: z.array(z.object({
    sourceId: z.string().min(1),
    excerpt: z.string().min(1),
    limitations: z.array(z.string()),
  })),
  requestedSupplement: z.string().nullable(),
})

export const outputSchema = z.object({
  findings: z.array(z.object({
    criterionId: z.string().min(1),
    currentCommunication: z.string().min(1),
    knowledgeStatus: z.enum(['fact', 'hypothesis', 'missing']),
    sourceIds: z.array(z.string()),
    limitations: z.array(z.string()),
  })),
  missingEvidence: z.array(z.string()),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
