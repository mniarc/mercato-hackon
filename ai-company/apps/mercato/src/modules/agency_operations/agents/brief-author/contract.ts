import { z } from 'zod'

export const sourceStoryIds = ['F09-1', 'F09-2', 'F56-1'] as const

const fieldSchema = z.object({ fieldId: z.string().min(1), content: z.string() })

export const inputSchema = z.object({
  briefTemplateVersionId: z.string().min(1),
  fields: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    priority: z.enum(['Must', 'Should', 'Could']),
  })),
  catalog: z.object({ versionId: z.string().min(1), scope: z.string().min(1) }),
  purchaseFacts: z.string().min(1),
  analysisPackageVersionId: z.string().min(1),
  analysis: z.array(z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    content: z.string().min(1),
  })),
  previousBrief: z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    fields: z.array(fieldSchema),
  }).nullable(),
  changeDirective: z.object({
    decisionId: z.string().min(1),
    affectedFieldIds: z.array(z.string()),
    instructions: z.string().min(1),
  }).nullable(),
})

export const outputSchema = z.object({
  draftFields: z.array(fieldSchema.extend({
    sourceReferences: z.array(z.string()),
    knowledgeStatus: z.enum(['fact', 'hypothesis', 'missing']),
    clientQuestion: z.string().nullable(),
  })),
  changes: z.array(z.object({
    fieldId: z.string().min(1),
    reason: z.string().min(1),
    dependencyReason: z.string().nullable(),
  })),
  unresolvedQuestions: z.array(z.string()),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
