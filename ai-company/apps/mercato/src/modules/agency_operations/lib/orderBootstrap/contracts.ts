import { z } from 'zod'
import { paidCaseProcessingSchema } from '../paidCaseAnalysis/status'
import { purchaseHistorySchema } from './purchaseSnapshot'

export const DEMO_PURCHASE_SERVICE = 'agencyDemoPurchaseService' as const

export const purchaseIdentitySchema = z.object({
  tenantId: z.uuid(), organizationId: z.uuid(), customerEntityId: z.uuid(), customerUserId: z.uuid(),
})

export const purchaseBuyerSchema = z.object({
  brandDisplayName: z.string().trim().min(1).max(200),
  brandWebsiteUrl: z.url().max(2000),
  market: z.string().trim().min(1).max(120),
  language: z.string().trim().min(1).max(80),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.email().max(254),
  billingBuyerType: z.enum(['company', 'individual']),
  billingLegalName: z.string().trim().min(1).max(200),
  billingCountry: z.string().trim().min(1).max(120),
  billingAddress: z.string().trim().min(1).max(1000),
  billingTaxId: z.string().trim().max(100),
  officialSocialUrl: z.union([z.url().max(2000), z.literal('')]),
  purchaseGoal: z.string().trim().max(240),
}).strict().refine((buyer) => buyer.billingBuyerType !== 'company' || buyer.billingTaxId.length > 0, {
  path: ['billingTaxId'], message: 'Company tax identifier is required',
})

export const demoPurchaseRequestSchema = z.object({
  requestId: z.uuid(),
  offerVersion: z.string().min(1),
  termsVersion: z.string().min(1),
  acceptedTerms: z.literal(true),
  buyer: purchaseBuyerSchema,
}).strict()

export const demoPurchaseReceiptSchema = z.object({
  orderId: z.uuid(),
  paymentId: z.uuid(),
  providerSessionId: z.string().nullable(),
  status: z.enum(['pending_payment', 'paid', 'blocked']),
  caseId: z.uuid().nullable(),
  workflowInstanceId: z.uuid().nullable(),
  reason: z.string().optional(),
  canRetryPayment: z.boolean().optional(),
  canConfirmPayment: z.boolean().optional(),
  purchaseHistory: purchaseHistorySchema.optional(),
  processing: paidCaseProcessingSchema.optional(),
})

export const demoPaymentRetrySchema = z.object({ providerSessionId: z.string().trim().min(1).max(255) }).strict()

export type PurchaseIdentity = z.infer<typeof purchaseIdentitySchema>
export type DemoPurchaseRequest = z.infer<typeof demoPurchaseRequestSchema>
export type DemoPurchaseReceipt = z.infer<typeof demoPurchaseReceiptSchema>
export type ActivatePaidPurchaseInput = {
  identity: PurchaseIdentity
  caseId: string
  orderId: string
  paymentId: string
  originalPurchase: DemoPurchaseRequest
  termsAcceptedAt: string
}
export type PaidPurchaseActivation = {
  caseId: string
  workflowInstanceId: string
  /** Runs after the purchase transaction commits: dispatches the analysis workflow's async research step. Absent on the waiting path. */
  launch?: () => Promise<void>
}
export type ActivatePaidPurchase = (input: ActivatePaidPurchaseInput) => Promise<PaidPurchaseActivation>

export type DemoPurchaseService = {
  start(identity: PurchaseIdentity, input: DemoPurchaseRequest): Promise<DemoPurchaseReceipt>
  confirm(identity: PurchaseIdentity, orderId: string): Promise<DemoPurchaseReceipt>
  retryPayment(identity: PurchaseIdentity, orderId: string, input: z.infer<typeof demoPaymentRetrySchema>): Promise<DemoPurchaseReceipt>
  read(identity: PurchaseIdentity, orderId: string): Promise<DemoPurchaseReceipt>
}
