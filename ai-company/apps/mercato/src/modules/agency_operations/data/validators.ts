import { z } from 'zod'

export const agencyCaseTitleSchema = z.string().trim().min(1).max(200)

export const createAgencyCaseSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  customerEntityId: z.string().uuid(),
  submittedByCustomerUserId: z.string().uuid(),
  title: agencyCaseTitleSchema,
})

export type CreateAgencyCaseInput = z.infer<typeof createAgencyCaseSchema>
