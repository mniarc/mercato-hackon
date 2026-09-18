import { z } from 'zod'
import { tovProcessRequestSchema } from '@/modules/agency_operations/lib/contracts'

export const portalMaterialRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  process: tovProcessRequestSchema.optional(),
})
