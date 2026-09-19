import { z } from 'zod'
import { outputSchema as salesAnswerSchema } from '../../agents/sales-advisor/contract'

export const SALES_QUESTIONS_SERVICE = 'agencySalesQuestionsService'
export const SALES_QUESTION_WORKFLOW_ID = 'agency_operations.sales-question.v1'
export const SALES_ANSWER_WORKFLOW_ID = 'agency_operations.sales-answer.v1'
export const SALES_QUESTION_ENTITY = 'agency_operations:sales_question'
export const SALES_ANSWER_SIGNAL = 'agency.sales-question.answered'
export const PREPARE_SALES_QUESTION = 'agency_operations.prepareSalesQuestion'
export const PREPARE_SALES_ANSWER = 'agency_operations.prepareSalesAnswer'
export const RECORD_SALES_ANSWER = 'agency_operations.recordSalesAnswer'

export const salesQuestionIdentitySchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), customerUserId: z.uuid() })
export const salesQuestionRequestSchema = z.object({
  eventId: z.uuid(), question: z.string().trim().min(1).max(4000), previousQuestionId: z.uuid().optional(),
}).strict()
export const salesCatalogueSchema = z.object({ versionId: z.string().min(1), productId: z.string().min(1), content: z.string().min(1) })
export const savedSalesQuestionSchema = salesQuestionIdentitySchema.extend({
  eventId: z.uuid(), question: z.string().min(1), previousQuestionId: z.uuid().nullable(), catalog: salesCatalogueSchema,
})
export const salesQuestionItemSchema = z.object({
  id: z.uuid(), eventId: z.uuid(), question: z.string(), createdAt: z.string(), previousQuestionId: z.uuid().nullable(),
  catalogVersionId: z.string(), productId: z.string(),
  state: z.enum(['waiting_configuration', 'processing', 'answered', 'attention_required']),
  answer: salesAnswerSchema.nullable(),
})
export const salesQuestionListSchema = z.object({ items: z.array(salesQuestionItemSchema), offer: salesCatalogueSchema })
export const salesQuestionResponseSchema = z.object({ item: salesQuestionItemSchema, replayed: z.boolean() })
export type SalesQuestionIdentity = z.infer<typeof salesQuestionIdentitySchema>
export type SalesQuestionItem = z.infer<typeof salesQuestionItemSchema>
export type SalesQuestionRequest = z.infer<typeof salesQuestionRequestSchema>
export type SavedSalesQuestion = z.infer<typeof savedSalesQuestionSchema>
export interface SalesQuestionsService {
  list(identity: SalesQuestionIdentity): Promise<z.infer<typeof salesQuestionListSchema>>
  submit(identity: SalesQuestionIdentity, input: SalesQuestionRequest): Promise<z.infer<typeof salesQuestionResponseSchema>>
}
