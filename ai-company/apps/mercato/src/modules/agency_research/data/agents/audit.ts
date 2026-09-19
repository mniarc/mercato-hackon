import { z } from 'zod'
import { businessProfileSchema, factKinds } from '../schemas/zrodla'
import { evidenceStatuses, gapPriorities, offerMapItemSchema, messageMapItemSchema, journeyItemSchema, relationshipItemSchema, reusableAssetSchema, voiceAuditSchema } from '../schemas/audyt'

/**
 * 3.3 agent I/O. The audit reads the register as ids + short text (never page
 * content) and returns sections of WEW-AUDYT: first the maps, then — with the maps
 * in hand — the voice, the gaps and the reusable assets.
 */

const ids = z.array(z.string().min(1))

const orderContext = z.object({ brand: z.string(), market: z.string(), language: z.string(), websiteUrl: z.string(), purchaseGoal: z.string().nullable() })

/** The register as the audit agents see it: everything by id, short text only. */
export const auditRegisterSchema = z.object({
  order: orderContext,
  outputLanguage: z.enum(['pl', 'en']),
  business_profile: businessProfileSchema,
  sources: z.array(z.object({ source_id: z.string(), publisher: z.string(), kind: z.string(), url: z.string(), access: z.string() })),
  facts: z.array(z.object({ fact_id: z.string(), kind: z.enum(factKinds), claim: z.string(), use_scope: z.array(z.string()), limitation: z.string().nullable(), source_ids: z.array(z.string()) })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable(), observed_result: z.string().nullable(), fact_ids: z.array(z.string()), limitations: z.array(z.string()) })),
  audience_signals: z.array(z.object({ signal_id: z.string(), role_or_organization: z.string(), trigger: z.string(), problem: z.string(), objection: z.string().nullable(), evidence_status: z.string(), fact_ids: z.array(z.string()) })),
  conflicts: z.array(z.object({ conflict_id: z.string(), facts: z.array(z.string()), detail: z.string(), question: z.string() })),
  /** QA findings addressed to this step on a repair pass. */
  repair_findings: z.array(z.unknown()),
})
export type AuditRegisterInput = z.infer<typeof auditRegisterSchema>

export const auditMapperResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    offer_map: z.array(offerMapItemSchema),
    buyer_map: z.array(
      z.object({
        status: z.enum(evidenceStatuses),
        initiator: z.string().min(1),
        user: z.string().min(1),
        decision_maker: z.string().min(1),
        purchase_moment: z.string().min(1),
        job: z.string().min(1),
        objections: z.array(z.string().min(1)),
        selection_criteria: z.string().nullable(),
        selection_criteria_status: z.enum(evidenceStatuses),
        direct_customer_voice: z.boolean(),
        fact_ids: ids,
      }),
    ),
    message_map: z.array(messageMapItemSchema),
    journey: z.array(journeyItemSchema),
    relationship: z.array(relationshipItemSchema),
  }),
})
export type AuditMaps = z.infer<typeof auditMapperResult>['data']

export const auditVoiceInputSchema = auditRegisterSchema.pick({ order: true, outputLanguage: true, repair_findings: true }).extend({
  language_samples: z.array(z.object({ sample_id: z.string(), source_id: z.string(), channel: z.string(), excerpt: z.string(), linguistic_features: z.array(z.string()), situation: z.string().nullable(), observed_function: z.string().nullable() })),
  voice_facts: z.array(z.object({ fact_id: z.string(), claim: z.string() })),
  maps: z.object({
    offer_map: z.array(z.object({ service: z.string(), fact_ids: z.array(z.string()) })),
    buyer_map: z.array(z.object({ scenario_id: z.string(), status: z.string(), job: z.string() })),
    message_map: z.array(z.object({ message: z.string(), risk: z.string(), fact_ids: z.array(z.string()) })),
    journey: z.array(z.object({ stage: z.string(), friction_status: z.string(), fact_ids: z.array(z.string()) })),
  }),
  coverage: z.array(z.object({ requirement: z.string(), readiness: z.string(), gap: z.string().nullable(), owner: z.string() })),
  content_bank: z.array(z.object({ seed_id: z.string(), angle: z.string(), readiness: z.string(), proof_ids: z.array(z.string()) })),
  proof_cards: z.array(z.object({ proof_id: z.string(), proof_type: z.string(), artifact_or_method: z.string().nullable() })),
})

/** The voice audit alone; the gaps and assets are a second agent so each registered schema stays small. */
export const auditVoiceResult = z.object({
  kind: z.literal('research'),
  data: z.object({ voice_audit: voiceAuditSchema }),
})

export const auditGapsResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    gaps: z.array(
      z.object({
        observation: z.string().min(1),
        business_impact_hypothesis: z.string().nullable(),
        evidence_ids: ids,
        priority: z.enum(gapPriorities),
        needed: z.string().min(1),
        destination: z.string().min(1),
        finding_type: z.string().min(1),
        consequence_for_work: z.string().min(1),
      }),
    ),
    reusable_assets: z.array(reusableAssetSchema),
  }),
})
