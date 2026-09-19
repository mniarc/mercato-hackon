import { z } from 'zod'

export const sourceStoryIds = ['F42-2', 'F43-1', 'F44-1', 'F44-2', 'F45-1', 'F47-1', 'F53-1', 'F57-1', 'F60-1'] as const

const versionReferenceSchema = z.object({ documentId: z.string().min(1), versionId: z.string().min(1) }).strict()

export const inputSchema = z.object({
  submissionId: z.uuid(),
  originalText: z.string(),
  savedTriage: z.object({ decisionId: z.string().min(1), partId: z.string().min(1), summary: z.string().min(1), rationale: z.string().min(1) }).strict(),
  scopeDecision: z.object({ decisionId: z.string().min(1), result: z.literal('in_scope'), rationale: z.string().min(1) }).strict(),
  processVersion: z.string().min(1),
  allowedResumeSteps: z.array(z.object({ stepId: z.string().min(1), purpose: z.string().min(1), sequence: z.number().int().nonnegative() }).strict()),
  documents: z.array(z.object({
    reference: versionReferenceSchema,
    kind: z.string().min(1),
    status: z.string().min(1),
    fields: z.array(z.object({ path: z.string().min(1), value: z.string() }).strict()),
    dependsOn: z.array(versionReferenceSchema),
  }).strict()),
  tasks: z.array(z.object({ taskId: z.string().min(1), stepId: z.string().min(1), dependsOn: z.array(versionReferenceSchema) }).strict()),
  evidence: z.array(z.object({ referenceId: z.string().min(1), text: z.string().min(1) }).strict()),
}).strict()

export const outputSchema = z.object({
  submissionId: z.uuid(),
  triageDecisionId: z.string().min(1),
  partId: z.string().min(1),
  scopeDecisionId: z.string().min(1),
  processVersion: z.string().min(1),
  recommendation: z.enum(['review_dependencies', 'source_only', 'clarify', 'employee_exception']),
  rationale: z.string().min(1),
  affected: z.array(z.object({ reference: versionReferenceSchema, fieldPaths: z.array(z.string().min(1)), reason: z.string().min(1) }).strict()),
  unchanged: z.array(z.object({ reference: versionReferenceSchema, fieldPaths: z.array(z.string().min(1)), reason: z.string().min(1) }).strict()),
  proposedTaskHolds: z.array(z.object({ taskId: z.string().min(1), reason: z.string().min(1) }).strict()),
  proposedResumeStepId: z.string().min(1).nullable(),
  evidenceReferenceIds: z.array(z.string().min(1)),
  clarificationQuestion: z.string().min(1).nullable(),
  effectsApplied: z.literal(false),
}).strict()

export type ChangeImpactInput = z.infer<typeof inputSchema>
export type ChangeImpactOutput = z.infer<typeof outputSchema>
