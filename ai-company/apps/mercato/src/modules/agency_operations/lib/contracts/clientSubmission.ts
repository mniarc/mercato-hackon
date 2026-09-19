import { z } from 'zod'
import type { ClientCaseIdentity } from './clientCaseQuery'
import { briefAcceptanceReceiptSchema, strategyPairAcceptanceReceiptSchema, planAcceptanceReceiptSchema } from '@/modules/agency_research/lib/contracts'
import { strategyPairRequestSchema } from '../strategyPairReview/contracts'
import { planReviewRequestSchema } from '../planReview/contracts'

export const CLIENT_SUBMISSION_SERVICE = 'agencyClientSubmissionService'
export const clientSubmissionRequestSchema = z.object({
  eventId: z.string().min(1).max(200),
  text: z.string().max(20000).optional(),
  materialAttachmentId: z.uuid().optional(),
  documentVersionReference: z.uuid().optional().describe('Unverified caller reference; never grants access or authorizes approval.'),
  strategyReviewResponse: strategyPairRequestSchema.safeExtend({ taskId: z.uuid() }).optional()
    .describe('Original response to an exact invited strategy/ToV pair; not acceptance authority.'),
  planReviewResponse: planReviewRequestSchema.safeExtend({ taskId: z.uuid() }).optional()
    .describe('Original exact plan response and explicit topic choice; not acceptance authority.'),
  reviewResponse: z.object({
    taskId: z.uuid(),
    channel: z.literal('portal'),
    kind: z.enum(['approval', 'message']),
    documentId: z.uuid(),
    versionId: z.uuid(),
    externalEventId: z.string().min(1).max(200),
    body: z.string().max(20000).optional(),
  }).strict().optional().describe('Preserved original review response; not proof of invitation access or approval authority.'),
  scaffoldScenario: z.enum(['answer', 'clarify']).default('clarify').describe('Explicit deterministic fixture only; not a live agent decision or provider fallback.'),
}).strict().refine((input) => Boolean(input.text?.trim() || input.materialAttachmentId), {
  message: 'Submission requires text or the case material reference',
})

const clientSubmissionDispositionBaseSchema = z.object({
  kind: z.enum(['answer', 'clarify', 'change', 'approve', 'hold', 'escalate']),
  source: z.enum(['deterministic_scaffold', 'native_agent']),
  workerId: z.enum(['agency_operations.client-triage.scaffold.v1', 'agency_operations.client_triage']),
  rationale: z.string(),
  message: z.string(),
  targets: z.object({ caseId: z.uuid(), submissionId: z.uuid(), documentVersionReference: z.uuid().optional() }),
})

export const clientSubmissionDispositionSchema = z.discriminatedUnion('effectsApplied', [
  clientSubmissionDispositionBaseSchema.extend({ effectsApplied: z.literal(false) }),
  clientSubmissionDispositionBaseSchema.extend({
    effectsApplied: z.literal(true), kind: z.literal('approve'), source: z.literal('native_agent'),
    workerId: z.literal('agency_operations.client_triage'),
    acceptance: z.discriminatedUnion('status', [briefAcceptanceReceiptSchema, strategyPairAcceptanceReceiptSchema, planAcceptanceReceiptSchema]),
  }),
])

export const clientSubmissionItemSchema = z.object({
  submissionId: z.uuid(), caseId: z.uuid(), eventId: z.string(), channel: z.literal('portal'),
  submittedByCustomerUserId: z.uuid(), createdAt: z.string(),
  original: clientSubmissionRequestSchema,
  workflow: z.object({ status: z.string(), currentStep: z.string() }).nullable(),
  disposition: clientSubmissionDispositionSchema.nullable(),
})

export type ClientSubmissionRequest = z.input<typeof clientSubmissionRequestSchema>
export type ClientSubmissionItem = z.infer<typeof clientSubmissionItemSchema>
export type ClientSubmissionDisposition = z.infer<typeof clientSubmissionDispositionSchema>
export type ClientSubmissionService = {
  submit(identity: ClientCaseIdentity, caseId: string, input: ClientSubmissionRequest): Promise<{ item: ClientSubmissionItem; replayed: boolean }>
  list(identity: ClientCaseIdentity, caseId: string): Promise<{ items: ClientSubmissionItem[] }>
}
