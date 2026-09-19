import { z } from 'zod'
import { tovBrandVoiceSchema, tovCitationSchema } from '../../data/validators'

/** The specialist owns this immutable version; consumers never mirror or rewrite its content. */
export const specialistTovReferenceSchema = z.object({
  owner: z.literal('agency_tov'), kind: z.literal('KLI-TOV'),
  researchRunId: z.uuid(), documentId: z.uuid(), versionId: z.uuid(),
  version: z.string().regex(/^[1-9]\d*\.0$/),
})
export type SpecialistTovReference = z.infer<typeof specialistTovReferenceSchema>
export const specialistTovDocumentSchema = specialistTovReferenceSchema.extend({
  brand: z.string().min(1), isCurrent: z.boolean(), body: tovBrandVoiceSchema,
  renderedMd: z.string(), citations: z.array(tovCitationSchema),
})
export type SpecialistTovDocument = z.infer<typeof specialistTovDocumentSchema>
/** Server-only read: caller owns staff ACL or exact customer-task/case authorization. */
export type ReadSpecialistTov = (
  scope: { tenantId: string; organizationId: string },
  reference: Pick<SpecialistTovReference, 'researchRunId' | 'versionId'>,
) => Promise<SpecialistTovDocument | null>
