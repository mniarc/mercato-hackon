import { z } from 'zod'

const confirmationIdentitySchema = z.object({
  paymentId: z.uuid(),
  providerTransactionId: z.uuid(),
  attemptedAt: z.iso.datetime(),
}).strict()

export const paymentConfirmationStateSchema = z.discriminatedUnion('status', [
  confirmationIdentitySchema.extend({ status: z.literal('sending') }),
  confirmationIdentitySchema.extend({ status: z.literal('sent'), sentAt: z.iso.datetime() }),
  confirmationIdentitySchema.extend({
    status: z.enum(['waiting_configuration', 'failed']),
    failedAt: z.iso.datetime(),
    reason: z.enum(['delivery_configuration_unavailable', 'delivery_disabled', 'delivery_failed']),
  }),
  confirmationIdentitySchema.extend({
    status: z.literal('waiting_input'),
    reason: z.literal('purchase_content_unavailable'),
  }),
])

export type PaymentConfirmationState = z.infer<typeof paymentConfirmationStateSchema>
