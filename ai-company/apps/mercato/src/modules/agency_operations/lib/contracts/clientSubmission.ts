import { z } from 'zod'
import type { ClientCaseIdentity } from './clientCaseQuery'

export const CLIENT_SUBMISSION_SERVICE = 'agencyClientSubmissionService'
export const clientSubmissionRequestSchema = z.object({
  eventId: z.string().min(1).max(200),
  text: z.string().max(20000).optional(),
  materialAttachmentId: z.uuid().optional(),
  documentVersionReference: z.uuid().optional().describe('Unverified caller reference; never grants access or authorizes approval.'),
  scaffoldScenario: z.enum(['answer', 'clarify']).default('clarify').describe('Explicit deterministic fixture only; not a live agent decision or provider fallback.'),
}).strict().refine((input) => Boolean(input.text?.trim() || input.materialAttachmentId), {
  message: 'Submission requires text or the case material reference',
})

export const clientSubmissionDispositionSchema = z.object({
  kind: z.enum(['answer', 'clarify', 'change', 'approve', 'hold', 'escalate']),
  source: z.enum(['deterministic_scaffold', 'native_agent']),
  workerId: z.enum(['agency_operations.client-triage.scaffold.v1', 'agency_operations.client_triage']),
  rationale: z.string(),
  message: z.string(),
  targets: z.object({ caseId: z.uuid(), submissionId: z.uuid(), documentVersionReference: z.uuid().optional() }),
  effectsApplied: z.literal(false),
})

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
