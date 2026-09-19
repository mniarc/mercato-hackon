import { z } from 'zod'

export const portalMaterialRequestSchema = z.object({
  caseId: z.uuid(), eventId: z.string().min(1).max(200), text: z.string().max(20000).optional(),
}).strict()
