import { z } from 'zod'

export const customerOnboardingRequestSchema = z.object({
  brandDisplayName: z.string().trim().min(1).max(200),
  brandWebsiteUrl: z.url().max(500),
  billingLegalName: z.string().trim().min(1).max(200),
}).strict()
export type CustomerOnboardingRequest = z.infer<typeof customerOnboardingRequestSchema>
export const customerOnboardingResultSchema = z.object({ customerEntityId: z.uuid(), replayed: z.boolean() })
export type CustomerOnboardingIdentity = { tenantId: string; organizationId: string; customerUserId: string }
