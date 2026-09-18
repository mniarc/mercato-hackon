import { z } from 'zod'

/**
 * WEW-DANE-ZAMOWIENIA — the order data the audit starts from. The canonical shape
 * is what the customer portal's order form emits (`agency/frontend/.../order/page.tsx`
 * `toOrderData()`, aligned to WZR-ZAMOWIENIE); Rafał's example package uses a few
 * `*_or_null` aliases and a `notes` field, which are accepted for the fixture.
 */

const nullableString = z.string().nullable()

const productSelectionSchema = z.object({
  sku: z.string().min(1),
  offer_version: z.string().min(1),
  price_net: z.number(),
  currency: z.string().min(1),
  tax_rule_ref: z.string().optional(),
  result_limits: z
    .object({
      brands: z.number().int(),
      markets: z.number().int(),
      languages: z.number().int(),
      plan_days: z.number().int(),
      topics: z.number().int(),
      finished_posts: z.number().int(),
      publications: z.number().int(),
    })
    .partial()
    .optional(),
})

export const orderDataSchema = z.object({
  product_selection: productSelectionSchema,
  brand: z.object({ display_name: z.string().min(1), website_url: z.string().min(1) }),
  market_language: z.object({ market: z.string().min(1), language: z.string().min(1) }),
  buyer_contact: z
    .object({ name: z.string(), email: z.string(), contact_id: nullableString.optional(), contact_id_or_null: nullableString.optional() })
    .optional(),
  billing: z.record(z.string(), z.unknown()).optional(),
  official_social: z
    .object({
      url: nullableString.optional(),
      url_or_null: nullableString.optional(),
      platform: nullableString.optional(),
      platform_or_null: nullableString.optional(),
      provenance: z.string().optional(),
    })
    .optional(),
  purchase_goal: nullableString.optional(),
  terms_confirmation: z.record(z.string(), z.unknown()).optional(),
  validation_result: z.record(z.string(), z.unknown()).optional(),
})
export type OrderData = z.infer<typeof orderDataSchema>

/** What the pipeline reads: one flat view over the canonical and the alias shapes. */
export type OrderFacts = {
  brand: string
  websiteUrl: string
  market: string
  language: string
  /** Output language of every document; falls back to `pl` for a Polish market, else `en`. */
  outputLanguage: 'pl' | 'en'
  officialSocialUrl: string | null
  officialSocialPlatform: string | null
  purchaseGoal: string | null
  sku: string
  topics: number
}

export function orderFactsOf(order: OrderData): OrderFacts {
  const social = order.official_social
  const language = order.market_language.language.trim().toLowerCase()
  return {
    brand: order.brand.display_name.trim(),
    websiteUrl: order.brand.website_url.trim(),
    market: order.market_language.market.trim(),
    language: order.market_language.language.trim(),
    outputLanguage: language.startsWith('pl') ? 'pl' : language.startsWith('en') ? 'en' : 'pl',
    officialSocialUrl: social?.url ?? social?.url_or_null ?? null,
    officialSocialPlatform: social?.platform ?? social?.platform_or_null ?? null,
    purchaseGoal: order.purchase_goal ?? null,
    sku: order.product_selection.sku,
    topics: order.product_selection.result_limits?.topics ?? 12,
  }
}
