import { z } from 'zod'
import type { ClientCaseIdentity } from './clientCaseQuery'

export const CLIENT_REPLY_SERVICE = 'agencyClientReplyService'
export const clientReplyRequestSchema = z.object({
  eventId: z.string().min(1).max(200),
  text: z.string().min(1).max(20000).refine((text) => text.trim().length > 0, 'Reply must not be blank'),
}).strict()

export const clientReplyItemSchema = z.object({
  replyId: z.uuid(), caseId: z.uuid(), submissionId: z.uuid(),
  channel: z.literal('portal'), submittedByCustomerUserId: z.uuid(), createdAt: z.string(),
  original: clientReplyRequestSchema,
  outcome: z.literal('clarification_received').describe('The original reply was accepted and its specific native clarification wait resumed. Not artifact approval or a new agent classification.'),
})
export const clientReplyResultSchema = z.object({ item: clientReplyItemSchema, replayed: z.boolean() })

export type ClientReplyRequest = z.infer<typeof clientReplyRequestSchema>
export type ClientReplyItem = z.infer<typeof clientReplyItemSchema>
export type ClientReplyService = {
  reply(identity: ClientCaseIdentity, caseId: string, submissionId: string, input: ClientReplyRequest): Promise<z.infer<typeof clientReplyResultSchema>>
  list(identity: ClientCaseIdentity, caseId: string, submissionId: string): Promise<{ items: ClientReplyItem[] }>
}
