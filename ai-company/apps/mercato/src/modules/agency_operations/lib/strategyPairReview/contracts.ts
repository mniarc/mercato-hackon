import { z } from 'zod'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import { documentReviewSchema } from '@/modules/agency/data/document-review'

export const STRATEGY_PAIR_REVIEW_SERVICE = 'agencyStrategyPairReviewService'
export const STRATEGY_PAIR_REVIEW_WORKFLOW_ID = 'agency_operations.strategy-pair-review.v1'
export const STRATEGY_PAIR_REVIEW_FORM_KEY = 'agency.strategy-pair-review'
export const STRATEGY_PAIR_REVIEW_CONTEXT_KEY = 'strategyPairInvitation'
export const STRATEGY_PAIR_RESPONSE_CONTEXT_KEY = 'strategyPairResponse'
export const STRATEGY_PAIR_RESPONSE_FUNCTION = 'agency_operations.receiveStrategyPairResponse'
export const strategyPairReviewSchema = z.object({ caseId: z.uuid(), strategy: documentReviewSchema, tov: documentReviewSchema })
export const strategyPairReadSchema = z.object({ ok: z.literal(true), review: strategyPairReviewSchema, canRespond: z.boolean() })
export const strategyPairInvitationSchema = z.object({ caseId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(), review: strategyPairReviewSchema })
const reference = z.object({ documentId: z.uuid(), versionId: z.uuid() }).strict()
export const strategyPairRequestSchema = z.object({
  channel: z.literal('portal'), kind: z.enum(['approval', 'message']), strategy: reference, tov: reference,
  approvedDocuments: z.array(z.enum(['strategy', 'tov'])).optional(), externalEventId: z.string().min(1).max(200), body: z.string().max(20000).optional(),
}).strict().superRefine((input, context) => {
  if (input.kind === 'approval' && (!input.approvedDocuments?.length || new Set(input.approvedDocuments).size !== input.approvedDocuments.length || input.body !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Approval requires unique selected documents and no message body' })
  }
  if (input.kind === 'message' && (!input.body?.trim() || input.approvedDocuments !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Message requires a body and no selected approvals' })
  }
})
export const strategyPairReceiptSchema = z.object({ requestId: z.uuid(), status: z.literal('response_received'), replayed: z.boolean() })
export type StrategyPairRequest = z.infer<typeof strategyPairRequestSchema>
export type StrategyPairReviewService = {
  invite(input: { caseId: string; strategyVersionId: string; tovVersionId: string; tenantId: string; organizationId: string; userId: string }): Promise<{ workflowInstanceId: string; taskId: string; replayed: boolean }>
  read(auth: CustomerAuthContext, taskId: string): Promise<z.infer<typeof strategyPairReadSchema>>
  respond(auth: CustomerAuthContext, taskId: string, input: StrategyPairRequest): Promise<z.infer<typeof strategyPairReceiptSchema>>
  receiveResponse(input: unknown, context: unknown): Promise<z.infer<typeof strategyPairReceiptSchema>>
}
