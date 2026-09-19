import { z } from 'zod'
import { demoPurchaseRequestSchema, purchaseIdentitySchema } from '../orderBootstrap/contracts'

export const PAID_CASE_ANALYSIS_CONTEXT = 'paidPurchaseOrigin'
export const paidPurchaseMaterialSchema = z.object({
  demoOnly: z.literal(true), identity: purchaseIdentitySchema, caseId: z.uuid(), orderId: z.uuid(), paymentId: z.uuid(),
  originalPurchase: demoPurchaseRequestSchema, termsAcceptedAt: z.iso.datetime(),
  demoOffer: z.object({ demoOnly: z.literal(true), sku: z.string().min(1), amount: z.number(), currency: z.string().min(1),
    offerVersion: z.string().min(1), termsVersion: z.string().min(1) }),
})
export const paidPurchaseOriginSchema = z.object({
  orderId: z.uuid(), paymentId: z.uuid(), purchaseWorkflowInstanceId: z.uuid(), materialHash: z.string().length(64),
}).strict()
export const directPaidPurchaseOriginSchema = z.object({
  orderId: z.uuid(), paymentId: z.uuid(), demoOnly: z.literal(true), materialHash: z.string().min(1),
  receiptAttachmentId: z.uuid().optional(), receiptHash: z.string().optional(),
})
export { paidCaseProcessingSchema, type PaidCaseProcessing } from './status'
export type PaidPurchaseMaterial = z.infer<typeof paidPurchaseMaterialSchema>
