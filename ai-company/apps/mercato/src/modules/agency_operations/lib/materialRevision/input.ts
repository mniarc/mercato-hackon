import { z } from 'zod'
import { researchMaterialSourceSchema } from '@/modules/agency_research/lib/contracts/agencyResearch'

export const materialContextSchema = z.object({
  material: researchMaterialSourceSchema,
  brief: z.object({ versionId: z.uuid(), clientViewMd: z.string().nullable() }).nullable(),
  state: z.enum(['eligible', 'brief_not_reviewable', 'impact_review_required', 'material_unreadable']),
}).strict()
export type MaterialContext = z.infer<typeof materialContextSchema>
