import { z } from 'zod'

export const sourceStoryIds = ['F21-1', 'F21-2'] as const

export const inputSchema = z.object({
  strategyTemplate: z.object({ versionId: z.string().min(1), content: z.string().min(1) }),
  acceptedBrief: z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    acceptanceId: z.string().min(1),
    content: z.string().min(1),
  }),
  analysis: z.array(z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    content: z.string().min(1),
  })),
  evidence: z.array(z.object({ sourceId: z.string().min(1), excerpt: z.string().min(1) })),
  previousStrategy: z.object({
    documentId: z.string().min(1),
    versionId: z.string().min(1),
    content: z.string().min(1),
  }).nullable(),
  changeDirective: z.object({
    decisionId: z.string().min(1),
    instructions: z.string().min(1),
    affectedSections: z.array(z.string()),
  }).nullable(),
})

export const outputSchema = z.object({
  positioning: z.string().min(1),
  valuePromise: z.string().min(1),
  differentiator: z.object({
    proposal: z.string().min(1),
    credibilityConditions: z.array(z.string()),
    sourceIds: z.array(z.string()),
  }),
  communicationRole: z.string().min(1),
  thematicPillars: z.array(z.string()),
  brandBoundaries: z.array(z.string()),
  rationale: z.array(z.object({
    section: z.string().min(1),
    explanation: z.string().min(1),
    sourceIds: z.array(z.string()),
  })),
  assumptionsAndLimitations: z.array(z.string()),
  changes: z.array(z.object({
    section: z.string().min(1),
    reason: z.string().min(1),
    dependencyReason: z.string().nullable(),
  })),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
