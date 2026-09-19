import { z } from 'zod'

export const sourceStoryIds = ['F08-1', 'F11-1'] as const

export const inputSchema = z.object({
  findingsTemplateVersionId: z.string().min(1),
  briefTemplateVersionId: z.string().min(1),
  briefFields: z.array(z.object({ id: z.string().min(1), question: z.string().min(1) })),
  analysis: z.array(z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    content: z.string().min(1),
  })),
  evidence: z.array(z.object({ sourceId: z.string().min(1), excerpt: z.string().min(1) })),
})

export const outputSchema = z.object({
  fields: z.array(z.object({
    fieldId: z.string().min(1),
    proposedAnswer: z.string().nullable(),
    sourceIds: z.array(z.string()),
    knowledgeStatus: z.enum(['fact', 'hypothesis', 'missing']),
    clientQuestion: z.string().nullable(),
    limitations: z.array(z.string()),
    materialsNeeded: z.array(z.string()),
  })),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
