import { z } from 'zod'

export const purchasedOfferSchema = z.object({
  demoOnly: z.literal(true), sku: z.string().min(1), name: z.string().min(1),
  amount: z.number().nonnegative(), currency: z.string().min(1), provider: z.string().min(1),
  offerVersion: z.string().min(1), termsVersion: z.string().min(1),
  terms: z.object({ en: z.string().min(1), pl: z.string().min(1) }).strict(),
}).strict()

const historyIdentity = z.object({
  offerVersion: z.string().min(1), termsVersion: z.string().min(1), acceptedAt: z.iso.datetime(),
})
export const purchaseHistorySchema = z.discriminatedUnion('state', [
  historyIdentity.extend({ state: z.literal('available'), offer: purchasedOfferSchema }),
  historyIdentity.extend({ state: z.literal('unavailable'), reason: z.literal('content_not_recorded') }),
])

export function readPurchaseHistory(binding: {
  offerVersion: string; termsVersion: string; termsAcceptedAt: string;
  acceptedOffer?: z.infer<typeof purchasedOfferSchema>;
}): z.infer<typeof purchaseHistorySchema> {
  const identity = { offerVersion: binding.offerVersion, termsVersion: binding.termsVersion, acceptedAt: binding.termsAcceptedAt }
  return binding.acceptedOffer
    ? { ...identity, state: 'available', offer: purchasedOfferSchema.parse(binding.acceptedOffer) }
    : { ...identity, state: 'unavailable', reason: 'content_not_recorded' }
}
