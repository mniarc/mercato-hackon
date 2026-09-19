import { z } from 'zod'

export const sourceStoryIds = ['F23-1', 'F27-1', 'F38-1', 'F38-2'] as const

const artifactRef = z.object({ documentId: z.string().min(1), version: z.string().min(1) }).strict()
const evidence = z.object({ sourceId: z.string().min(1), excerpt: z.string().min(1) }).strict()

export const inputSchema = z.object({
  stage: z.enum(['strategy_pair', 'plan', 'delivery']),
  artifacts: z.array(z.object({ ref: artifactRef, content: z.string().min(1) }).strict()).min(1),
  acceptedInputRefs: z.array(artifactRef),
  criteria: z.object({ version: z.string().min(1), rules: z.array(z.string().min(1)).min(1) }).strict(),
  evidence: z.array(evidence),
  mechanicalFindings: z.array(z.string().min(1)),
}).strict()

const common = {
  reviewedRefs: z.array(artifactRef).min(1),
  criteriaVersion: z.string().min(1),
  findings: z.array(z.object({
    artifact: artifactRef,
    field: z.string().min(1),
    reason: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    proposedOwner: z.enum(['author', 'research', 'client', 'employee']),
  }).strict()),
  rationale: z.string().min(1),
}

export const outputSchema = z.discriminatedUnion('stage', [
  z.object({ ...common, stage: z.literal('strategy_pair'), recommendation: z.enum(['pass', 'rework', 'exception']) }).strict(),
  z.object({ ...common, stage: z.literal('plan'), recommendation: z.enum(['pass', 'rework', 'exception']) }).strict(),
  z.object({
    ...common,
    stage: z.literal('delivery'),
    recommendation: z.enum(['ready', 'rework', 'exception']),
    clientSafeConclusions: z.array(z.object({
      text: z.string().min(1),
      basis: z.enum(['fact', 'hypothesis']),
      sourceIds: z.array(z.string().min(1)),
      limitations: z.array(z.string().min(1)),
    }).strict()),
  }).strict(),
])

export type QualityReviewInput = z.infer<typeof inputSchema>
export type QualityReviewProposal = z.infer<typeof outputSchema>
