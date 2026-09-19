import { z } from 'zod'
import type { AgentRunCtx } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import { tovRevisionFieldSchema } from '../../data/validators'
import { specialistTovReferenceSchema } from '../documentVersion/contracts'

export const TOV_REVISION_POLICY_KEY = 'agencyTovRevision'
export const TOV_REVISION_FUNCTION = 'agency_operations.reviseToneOfVoice'
export const tovRevisionPolicySchema = z.object({
  enabled: z.literal(true), maxAgentCalls: z.literal(1), runTimeoutMs: z.number().int().positive(),
}).strict()
export const tovRevisionExecutionPolicySchema = tovRevisionPolicySchema.extend({
  definitionId: z.uuid(), definitionVersion: z.number().int().positive(),
})
export const tovRevisionRequestSchema = z.object({
  requestId: z.uuid(), previous: specialistTovReferenceSchema,
  briefVersionId: z.uuid(), strategyVersionId: z.uuid(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pair_qa'), qaTaskRunId: z.uuid() }).strict(),
    z.object({ kind: z.literal('client_change'), submissionId: z.uuid(), invitationTaskId: z.uuid(), agentRunId: z.uuid() }).strict(),
  ]),
  instructions: z.string().trim().min(1).max(20000),
  affectedFields: z.array(tovRevisionFieldSchema).min(1).refine((fields) => new Set(fields).size === fields.length),
}).strict()
export const tovRevisionCompletedSchema = z.object({
  status: z.literal('completed'), requestId: z.uuid(), previousVersionId: z.uuid(),
  reference: specialistTovReferenceSchema, agentRunIds: z.array(z.uuid()),
  changedFields: z.array(tovRevisionFieldSchema), replayed: z.boolean(),
})
export const tovRevisionResultSchema = z.union([
  tovRevisionCompletedSchema,
  z.object({ status: z.literal('not_configured'), reason: z.literal('revision_execution_not_authorized') }),
  z.object({ status: z.literal('not_ready'), reason: z.enum(['previous_version_unavailable', 'previous_version_not_current', 'evidence_unavailable', 'revision_in_progress', 'workflow_unavailable']) }),
  z.object({ status: z.literal('execution_incomplete'), researchRunId: z.uuid(), reason: z.enum(['in_progress_or_interrupted', 'failed', 'result_unavailable']) }),
])
export type TovRevisionRequest = z.infer<typeof tovRevisionRequestSchema>
export type TovRevisionResult = z.infer<typeof tovRevisionResultSchema>
export type TovRevisionInput = {
  context: AgentRunCtx
  /** Trusted caller reloads the saved QA/client decision and exact case/version binding. */
  request: TovRevisionRequest
  /** Pinned staff-authored native definition policy, not a client/model assertion. No monetary cap is claimed. */
  executionPolicy?: z.infer<typeof tovRevisionExecutionPolicySchema>
}
