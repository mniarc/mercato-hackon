import { createHash } from 'node:crypto'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { analysisMaterialSchema, type AnalysisExecutionPolicy } from '../analysisProcess/contracts'
import { paidPurchaseMaterialSchema, paidPurchaseOriginSchema, type PaidPurchaseMaterial } from './contracts'

export function purchaseMatchesAnalysisProduct(purchase: PaidPurchaseMaterial, policy: AnalysisExecutionPolicy): boolean {
  const offer = purchase.demoOffer
  const product = policy.productSelection
  return product.sku === offer.sku && product.offer_version === offer.offerVersion
    && product.price_net === offer.amount && product.currency === offer.currency
    && purchase.originalPurchase.offerVersion === offer.offerVersion && purchase.originalPurchase.termsVersion === offer.termsVersion
}

/** Internal mapping of literal saved purchase fields, not a new client material format. */
export function mapPaidPurchaseMaterial(buffer: Buffer, rawOrigin: unknown, binding: {
  caseId: string; tenantId: string; organizationId: string; customerEntityId: string; customerUserId: string
}, policy: AnalysisExecutionPolicy) {
  if (buffer.length > 1024 * 1024) throw new CrudHttpError(409, { error: 'Purchase material is too large.' })
  const origin = paidPurchaseOriginSchema.parse(rawOrigin)
  const purchase = paidPurchaseMaterialSchema.parse(JSON.parse(buffer.toString('utf8')))
  if (createHash('sha256').update(buffer).digest('hex') !== origin.materialHash || purchase.orderId !== origin.orderId || purchase.paymentId !== origin.paymentId
    || purchase.caseId !== binding.caseId || Object.entries(purchase.identity).some(([key, value]) => value !== binding[key as keyof typeof binding])) {
    throw new CrudHttpError(409, { error: 'Purchase material does not match the paid case.' })
  }
  if (!purchaseMatchesAnalysisProduct(purchase, policy)) throw new CrudHttpError(409, { error: 'Configure analysis for the purchased product and its explicit limits.' })
  const buyer = purchase.originalPurchase.buyer
  return analysisMaterialSchema.parse({ order: {
    product_selection: policy.productSelection,
    brand: { display_name: buyer.brandDisplayName, website_url: buyer.brandWebsiteUrl },
    market_language: { market: buyer.market, language: buyer.language },
    buyer_contact: { name: buyer.contactName, email: buyer.contactEmail, contact_id: purchase.identity.customerUserId },
    billing: { buyer_type: buyer.billingBuyerType, legal_name: buyer.billingLegalName, country: buyer.billingCountry,
      address: buyer.billingAddress, tax_id: buyer.billingTaxId },
    official_social: { url: buyer.officialSocialUrl || null, platform: null, provenance: 'original_purchase' },
    purchase_goal: buyer.purchaseGoal || null,
    terms_confirmation: { accepted: purchase.originalPurchase.acceptedTerms, version: purchase.originalPurchase.termsVersion, accepted_at: purchase.termsAcceptedAt },
  } })
}
