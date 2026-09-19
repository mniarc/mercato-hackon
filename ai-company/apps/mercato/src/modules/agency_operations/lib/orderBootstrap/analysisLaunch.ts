import type { EntityManager } from '@mikro-orm/postgresql'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { analysisExecutionPolicySchema, analysisMaterialSchema, type AnalysisExecutionPolicy } from '../analysisProcess/contracts'
import { AGENCY_ANALYSIS_FUNCTION_NAME, AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import type { DemoPurchaseRequest } from './contracts'

/**
 * The hop from a verified paid purchase to the configured analysis. When the
 * scope has a published analysis policy and execution is enabled, the purchase
 * form is enough to build the research order (WEW-DANE-ZAMOWIENIA) — no JSON
 * upload — and the paid case starts `agency_operations.analysis.v1` directly
 * instead of parking at `awaiting_execution`. Without a policy or with
 * execution disabled the purchase keeps its original waiting behaviour.
 */

export type AnalysisLaunch = { workflowId: string; version: number; policy: AnalysisExecutionPolicy }

export async function readAnalysisLaunch(container: AppContainer, scope: { tenantId: string; organizationId: string }): Promise<AnalysisLaunch | null> {
  if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return null
  const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(container.resolve<EntityManager>('em'), {
    workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, tenantId: scope.tenantId, organizationId: scope.organizationId,
  })
  if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return null
  const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
    .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === AGENCY_ANALYSIS_FUNCTION_NAME)
  const policy = activities.length === 1 ? analysisExecutionPolicySchema.safeParse(activities[0].config.args?.policy) : null
  if (!policy?.success) return null
  return { workflowId: definition.workflowId, version: definition.version, policy: policy.data }
}

function socialPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (host.endsWith('linkedin.com')) return 'LinkedIn'
    if (host.endsWith('facebook.com')) return 'Facebook'
    if (host.endsWith('instagram.com')) return 'Instagram'
    if (host === 'x.com' || host.endsWith('twitter.com')) return 'X'
    if (host.endsWith('tiktok.com')) return 'TikTok'
    if (host.endsWith('youtube.com')) return 'YouTube'
    return host
  } catch {
    return null
  }
}

/** The purchase form as the research order: product selection is the policy's (the purchase authority), everything else is what the client typed. */
export function buildAnalysisMaterial(purchase: DemoPurchaseRequest, policy: AnalysisExecutionPolicy, args: { orderId: string; termsAcceptedAt: string }) {
  const { buyer } = purchase
  const social = buyer.officialSocialUrl
    ? { url: buyer.officialSocialUrl, platform: socialPlatform(buyer.officialSocialUrl), provenance: 'client_provided' }
    : { url: null, platform: null, provenance: 'client_provided' }
  return analysisMaterialSchema.parse({
    order: {
      product_selection: policy.productSelection,
      brand: { display_name: buyer.brandDisplayName, website_url: buyer.brandWebsiteUrl },
      market_language: { market: buyer.market, language: buyer.language },
      buyer_contact: { name: buyer.contactName, email: buyer.contactEmail, contact_id: null },
      billing: {
        buyer_type: buyer.billingBuyerType, legal_name: buyer.billingLegalName, country: buyer.billingCountry,
        address: buyer.billingAddress, tax_id: buyer.billingTaxId || null, sales_order_id: args.orderId,
      },
      official_social: social,
      purchase_goal: buyer.purchaseGoal || null,
      terms_confirmation: { terms_version: purchase.termsVersion, state: 'provided', event_ref: args.orderId, accepted_at: args.termsAcceptedAt },
    },
  })
}
