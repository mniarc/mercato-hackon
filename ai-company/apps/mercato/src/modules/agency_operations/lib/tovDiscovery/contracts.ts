import { z } from 'zod'
import {
  tovDiscoveredTargetSchema,
  tovOutputLanguages,
} from '@/modules/agency_tov/data/validators'

export const TOV_DISCOVERY_STEP_ID = 'agency_tov_source_discovery' as const
export const TOV_DISCOVERY_MIN_CONFIDENCE = 0.6

const publicUrlSchema = z.url().max(2_048).refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, 'Only public http(s) URLs are supported')

export const tovDiscoveryRequestSchema = z.object({
  caseId: z.uuid(),
  /** Caller-owned idempotency key. A new key is an explicit new paid run. */
  eventId: z.string().trim().min(1).max(100),
  brand: z.string().trim().min(1).max(200),
  people: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    knownUrls: z.array(publicUrlSchema).max(10),
  }).strict()).max(20),
  websiteUrl: publicUrlSchema.nullable(),
  outputLanguage: z.enum(tovOutputLanguages),
}).strict()

export const tovDiscoveryInputSchema = tovDiscoveryRequestSchema.extend({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
}).strict()

export const tovDiscoveryTargetSchema = tovDiscoveredTargetSchema.extend({
  collectorSupported: z.boolean(),
  meetsMinimumConfidence: z.boolean(),
}).strict()

export const tovDiscoveryStatusSchema = z.object({
  discoveryRunId: z.uuid(),
  caseId: z.uuid(),
  customerEntityId: z.uuid(),
  runStatus: z.enum(['running', 'ok', 'error', 'cancelled']),
  state: z.enum(['running', 'completed', 'attention_required']),
  replayed: z.boolean(),
  minimumConfidence: z.literal(TOV_DISCOVERY_MIN_CONFIDENCE),
  notes: z.string().min(1).nullable(),
  targets: z.array(tovDiscoveryTargetSchema),
  collectorAvailable: z.boolean(),
  collectorCandidateCount: z.number().int().min(0),
  handoff: z.object({
    state: z.enum(['awaiting_staff_corpus', 'discovery_running', 'discovery_attention_required']),
    corpusReady: z.literal(false),
    intakeStarted: z.literal(false),
    reason: z.enum([
      'source_scout_returns_targets_not_normalized_corpus',
      'source_discovery_in_progress',
      'source_discovery_did_not_complete',
    ]),
    nextAction: z.enum([
      'review_targets_collect_and_upload_normalized_corpus',
      'wait_for_saved_discovery_result',
      'review_run_and_submit_new_event_if_authorized',
    ]),
    suppliedCorpusEndpoint: z.literal('/api/agency_operations/tov-intakes'),
  }).strict(),
}).strict()

export type TovDiscoveryStatus = z.infer<typeof tovDiscoveryStatusSchema>

export type TovDiscoveryService = {
  start: (input: z.infer<typeof tovDiscoveryInputSchema>) => Promise<TovDiscoveryStatus>
  get: (input: {
    tenantId: string
    organizationId: string
    userId: string
    discoveryRunId: string
  }) => Promise<TovDiscoveryStatus>
}
