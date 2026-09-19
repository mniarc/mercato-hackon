import { z } from 'zod'
import { publicationTargetSchema } from '../publicationConsent/contracts'
import { publicationPreparationResultSchema } from '../publicationPreparation/contracts'

export const discordDestinationIdSchema = z.string().regex(/^\d{17,20}$/)
export const configurePublicationDestinationInputSchema = z.object({
  context: z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() }).strict(),
  request: z.object({
    orderRef: z.string().min(1), nativeChannelId: z.uuid(), credentialsRef: z.uuid(),
    accountId: discordDestinationIdSchema.nullable(), channelId: discordDestinationIdSchema,
    displayName: z.string().trim().min(1).max(200),
  }).strict(),
}).strict()
export type ConfigurePublicationDestinationInput = z.infer<typeof configurePublicationDestinationInputSchema>
export const publicationDestinationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('configured'), orderRef: z.string(), configVersionId: z.uuid(),
    target: publicationTargetSchema, readiness: z.literal('not_verified'), canSend: z.literal(false), replayed: z.boolean(),
    preparation: publicationPreparationResultSchema.optional() }),
  z.object({ status: z.literal('not_ready'), orderRef: z.string(), canSend: z.literal(false),
    reason: z.enum(['order_not_ready', 'configuration_invalid', 'channel_inactive', 'adapter_unavailable',
      'credentials_missing', 'credentials_invalid', 'target_not_configured']) }),
])
export type PublicationDestinationResult = z.infer<typeof publicationDestinationResultSchema>
