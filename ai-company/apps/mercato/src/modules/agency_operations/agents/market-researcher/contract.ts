import { z } from 'zod'

export const sourceStoryIds = ['F07-2', 'F07-3', 'F11-1', 'F11-2', 'F44-2'] as const

export const inputSchema = z.object({
  competitionTemplateVersionId: z.string().min(1),
  sourceRegisterVersionId: z.string().min(1),
  businessProfile: z.string().min(1),
  scope: z.string().min(1),
  criteria: z.array(z.object({ id: z.string().min(1), description: z.string().min(1) })),
  clientAudit: z.object({ versionId: z.string().min(1), content: z.string().min(1) }).nullable(),
  candidates: z.array(z.object({
    candidateId: z.string().min(1),
    name: z.string().min(1),
    evidence: z.array(z.object({ sourceId: z.string().min(1), excerpt: z.string().min(1) })),
  })),
  requestedSupplement: z.string().nullable(),
})

export const outputSchema = z.object({
  competitors: z.array(z.object({
    candidateId: z.string().min(1),
    kind: z.enum(['direct', 'alternative']),
    selectionRationale: z.string().min(1),
    findings: z.array(z.object({
      criterionId: z.string().min(1),
      observation: z.string().min(1),
      sourceIds: z.array(z.string()),
      limitations: z.array(z.string()),
    })),
  })).max(3),
  comparison: z.array(z.object({
    criterionId: z.string().min(1),
    similarity: z.string().nullable(),
    possibleDifferentiator: z.string().nullable(),
    sourceIds: z.array(z.string()),
    unknowns: z.array(z.string()),
  })),
  supplementationRequests: z.array(z.object({
    target: z.enum(['sources', 'market_research']),
    question: z.string().min(1),
  })),
})

export type AgentInput = z.infer<typeof inputSchema>
export type AgentOutput = z.infer<typeof outputSchema>
