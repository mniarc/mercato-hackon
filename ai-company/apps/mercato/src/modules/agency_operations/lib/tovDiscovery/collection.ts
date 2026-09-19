import { createHash } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { WorkflowEvent, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { logWorkflowEvent } from '@open-mercato/core/modules/workflows/lib/event-logger'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import type { TovPost } from '@/modules/agency_tov/data/validators'
import { AGENCY_TOV_WORKFLOW_ID, assertTovProcessConfigured } from '../tovProcess'
import {
  STAFF_TOV_INTAKE_SERVICE,
  staffTovIntakeStatusSchema,
  type StaffTovIntakeService,
} from '../tovIntake/contracts'
import { tovDiscoveryStatusSchema } from './contracts'
import {
  TOV_DISCOVERY_WRITE_FEATURES,
  createTovDiscoveryService,
  readPaidDiscoveryCase,
} from './service'

export const TOV_DISCOVERY_COLLECTION_ENABLED = 'AGENCY_TOV_DISCOVERY_COLLECTION_ENABLED' as const
export const TOV_COLLECTION_POSTS_PER_OWNER = 8
export const TOV_COLLECTION_POSTS_TOTAL = 100

const REQUESTED = 'AGENCY_TOV_COLLECTION_REQUESTED'
const COMPLETED = 'AGENCY_TOV_COLLECTION_COMPLETED'
const FAILED = 'AGENCY_TOV_COLLECTION_FAILED'
const UNKNOWN = 'AGENCY_TOV_COLLECTION_UNKNOWN'
const EVENT_TYPES = [REQUESTED, COMPLETED, FAILED, UNKNOWN]

export const tovCollectionRequestSchema = z.object({
  caseId: z.uuid(),
  eventId: z.string().trim().min(1).max(100),
  targetIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Target IDs must be unique'),
}).strict()

export const tovCollectionStatusSchema = z.object({
  collectionId: z.string().regex(/^[a-f0-9]{24}$/),
  discoveryRunId: z.uuid(),
  caseId: z.uuid(),
  customerEntityId: z.uuid(),
  state: z.enum(['running', 'completed', 'attention_required']),
  replayed: z.boolean(),
  selectedTargetIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)),
  postCount: z.number().int().min(0),
  reason: z.enum([
    'collection_in_progress',
    'normalized_corpus_handed_to_intake',
    'no_posts_collected',
    'scrape_failed',
    'collection_outcome_unknown',
    'intake_outcome_unknown',
  ]),
  intake: staffTovIntakeStatusSchema.nullable(),
}).strict()

export type TovCollectionStatus = z.infer<typeof tovCollectionStatusSchema>

type CorpusScraper = {
  available(): boolean
  sourceOf(url: string): string | null
  scrape(input: { url: string; maxPosts: number }): Promise<{
    posts: TovPost[]
    actorId: string
    items: number
    error: string | null
  }>
}

type Scope = { tenantId: string; organizationId: string }
type CollectionInput = z.infer<typeof tovCollectionRequestSchema> & Scope & {
  userId: string
  discoveryRunId: string
}
type CollectionEventData = {
  collectionId: string
  requestKey: string
  selectionHash: string
  discoveryRunId: string
  caseId: string
  customerEntityId: string
  selectedTargetIds: string[]
  postCount: number
  reason?: TovCollectionStatus['reason']
  intakeWorkflowInstanceId?: string
}

const eventDataSchema = z.object({
  collectionId: z.string().regex(/^[a-f0-9]{24}$/),
  requestKey: z.string().regex(/^[a-f0-9]{64}$/),
  selectionHash: z.string().regex(/^[a-f0-9]{64}$/),
  discoveryRunId: z.uuid(),
  caseId: z.uuid(),
  customerEntityId: z.uuid(),
  selectedTargetIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)),
  postCount: z.number().int().min(0),
  reason: tovCollectionStatusSchema.shape.reason.optional(),
  intakeWorkflowInstanceId: z.uuid().optional(),
}).strict()

function conflict(): never {
  throw new CrudHttpError(409, { error: 'api.errors.conflict' })
}

function requestKey(eventId: string): string {
  return createHash('sha256').update(eventId).digest('hex')
}

function selectionHash(targetIds: string[]): string {
  // Order is meaningful: the first selected channel that fills an owner's
  // eight-post allowance prevents later channels for that owner from billing.
  return createHash('sha256').update(JSON.stringify(targetIds)).digest('hex')
}

function collectionId(caseId: string, discoveryRunId: string, key: string): string {
  return createHash('sha256').update(`tov-collection:${caseId}:${discoveryRunId}:${key}`).digest('hex').slice(0, 24)
}

function intakeEventId(discoveryRunId: string, id: string): string {
  return `tov-discovery:${discoveryRunId}:${id}`
}

function parseEvents(events: WorkflowEvent[]): Array<{ event: WorkflowEvent; data: CollectionEventData }> {
  return events.flatMap((event) => {
    const parsed = eventDataSchema.safeParse(event.eventData)
    return parsed.success ? [{ event, data: parsed.data }] : []
  })
}

function savedStatus(
  eventType: string,
  data: CollectionEventData,
  replayed: boolean,
  intake: TovCollectionStatus['intake'],
): TovCollectionStatus {
  const reason = eventType === COMPLETED ? 'normalized_corpus_handed_to_intake'
    : eventType === FAILED ? data.reason === 'scrape_failed' ? 'scrape_failed' : 'no_posts_collected'
      : eventType === UNKNOWN ? data.reason === 'intake_outcome_unknown' ? 'intake_outcome_unknown' : 'collection_outcome_unknown'
        : 'collection_in_progress'
  return tovCollectionStatusSchema.parse({
    collectionId: data.collectionId,
    discoveryRunId: data.discoveryRunId,
    caseId: data.caseId,
    customerEntityId: data.customerEntityId,
    state: eventType === COMPLETED ? 'completed' : eventType === REQUESTED ? 'running' : 'attention_required',
    replayed,
    selectedTargetIds: data.selectedTargetIds,
    postCount: data.postCount,
    reason,
    intake,
  })
}

async function appendEvent(
  em: EntityManager,
  scope: Scope,
  workflowInstanceId: string,
  userId: string,
  eventType: string,
  data: CollectionEventData,
): Promise<void> {
  await logWorkflowEvent(em, {
    ...scope,
    workflowInstanceId,
    userId,
    eventType,
    eventData: eventDataSchema.parse(data),
  })
}

async function terminalStatus(
  container: AppContainer,
  input: CollectionInput,
  eventType: string,
  data: CollectionEventData,
): Promise<TovCollectionStatus> {
  let intake: TovCollectionStatus['intake'] = null
  if (eventType === COMPLETED && data.intakeWorkflowInstanceId) {
    intake = await container.resolve<StaffTovIntakeService>(STAFF_TOV_INTAKE_SERVICE).get({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      userId: input.userId,
      workflowInstanceId: data.intakeWorkflowInstanceId,
    })
  }
  return savedStatus(eventType, data, true, intake)
}

export type TovCollectionService = {
  collect(input: CollectionInput): Promise<TovCollectionStatus>
}

export function createTovCollectionService(container: AppContainer): TovCollectionService {
  const em = container.resolve<EntityManager>('em')
  return {
    async collect(rawInput) {
      const input = tovCollectionRequestSchema.extend({
        tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), discoveryRunId: z.uuid(),
      }).strict().parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      const authorized = await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
        .userHasAllFeatures(input.userId, TOV_DISCOVERY_WRITE_FEATURES, scope)
      if (!authorized) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })

      const discovery = tovDiscoveryStatusSchema.parse(await createTovDiscoveryService(container).get({
        ...scope,
        userId: input.userId,
        discoveryRunId: input.discoveryRunId,
      }))
      if (discovery.caseId !== input.caseId || discovery.state !== 'completed') conflict()
      const selected = input.targetIds.map((id) => discovery.targets.find((target) => target.targetId === id))
      if (selected.some((target) => !target)) conflict()
      const targets = selected.filter((target): target is NonNullable<typeof target> => Boolean(target))

      const key = requestKey(input.eventId)
      const id = collectionId(input.caseId, input.discoveryRunId, key)
      const selectedIds = [...input.targetIds]
      const selectedHash = selectionHash(selectedIds)
      const baseEvent: CollectionEventData = {
        collectionId: id,
        requestKey: key,
        selectionHash: selectedHash,
        discoveryRunId: input.discoveryRunId,
        caseId: discovery.caseId,
        customerEntityId: discovery.customerEntityId,
        selectedTargetIds: selectedIds,
        postCount: 0,
      }

      // A replay reads its immutable saved handoff without requiring today's
      // scraper token or workflow activation. Those preflights govern new paid
      // work, not the visibility of work already attempted.
      const paidCase = await readPaidDiscoveryCase(em, scope, input.caseId)
      if (!paidCase.workflowInstanceId) conflict()
      const savedRows = await em.find(WorkflowEvent, {
        ...scope,
        workflowInstanceId: paidCase.workflowInstanceId,
        eventType: { $in: EVENT_TYPES },
      }, { orderBy: { occurredAt: 'ASC' } })
      const saved = parseEvents(savedRows).filter(({ data }) => data.requestKey === key)
      if (saved.length) {
        if (saved.some(({ data }) => data.selectionHash !== selectedHash || data.discoveryRunId !== input.discoveryRunId)) conflict()
        const terminal = [...saved].reverse().find(({ event }) => event.eventType !== REQUESTED)
        const current = terminal ?? saved[saved.length - 1]
        return terminalStatus(container, input, current.event.eventType, current.data)
      }

      if (!parseBooleanWithDefault(process.env[TOV_DISCOVERY_COLLECTION_ENABLED], false)) {
        throw new CrudHttpError(409, { error: 'Tone-of-voice discovery collection is not enabled' })
      }
      if (!container.hasRegistration('agencyTovCorpusScraper')) conflict()
      const scraper = container.resolve<CorpusScraper>('agencyTovCorpusScraper')
      if (!scraper.available()) conflict()
      await assertTovProcessConfigured(container, scope)
      if (targets.some((target) => !target.collectorSupported || !target.meetsMinimumConfidence
        || scraper.sourceOf(target.url) !== target.source)) conflict()

      const reservation = await em.transactional(async (tx) => {
        const agencyCase = await readPaidDiscoveryCase(tx, scope, input.caseId)
        const lockedAnalysis = await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope, id: agencyCase.workflowInstanceId, deletedAt: null,
        }, { lockMode: LockMode.PESSIMISTIC_WRITE }, scope)
        if (!lockedAnalysis) conflict()
        const rows = await tx.find(WorkflowEvent, {
          ...scope,
          workflowInstanceId: agencyCase.workflowInstanceId,
          eventType: { $in: EVENT_TYPES },
        }, { orderBy: { occurredAt: 'ASC' } })
        const events = parseEvents(rows)
        const same = events.filter(({ data }) => data.requestKey === key)
        if (same.length) {
          if (same.some(({ data }) => data.selectionHash !== selectedHash || data.discoveryRunId !== input.discoveryRunId)) conflict()
          const terminal = [...same].reverse().find(({ event }) => event.eventType !== REQUESTED)
          return terminal ?? same[same.length - 1]
        }
        const unresolved = events.some(({ event, data }) => event.eventType === REQUESTED
          && !events.some((candidate) => candidate.data.requestKey === data.requestKey && candidate.event.eventType !== REQUESTED))
        if (unresolved || events.some(({ event }) => event.eventType === UNKNOWN)) conflict()
        const existingIntake = await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope,
          workflowId: AGENCY_TOV_WORKFLOW_ID,
          correlationKey: `agency-tov-intake:${agencyCase.id}`,
          deletedAt: null,
        }, undefined, scope)
        if (existingIntake) conflict()
        await appendEvent(tx, scope, agencyCase.workflowInstanceId!, input.userId, REQUESTED, baseEvent)
        return null
      })
      if (reservation) return terminalStatus(container, input, reservation.event.eventType, reservation.data)

      const posts: TovPost[] = []
      const seen = new Set<string>()
      const byOwner = new Map<string, number>()
      let knownFailures = 0
      try {
        for (const target of targets) {
          if (posts.length >= TOV_COLLECTION_POSTS_TOTAL) break
          const ownerCount = byOwner.get(target.owner) ?? 0
          if (ownerCount >= TOV_COLLECTION_POSTS_PER_OWNER) continue
          const remaining = Math.min(TOV_COLLECTION_POSTS_PER_OWNER - ownerCount, TOV_COLLECTION_POSTS_TOTAL - posts.length)
          const result = await scraper.scrape({ url: target.url, maxPosts: remaining })
          if (result.error) knownFailures += 1
          for (const post of result.posts) {
            if (post.source !== target.source || posts.length >= TOV_COLLECTION_POSTS_TOTAL
              || (byOwner.get(target.owner) ?? 0) >= TOV_COLLECTION_POSTS_PER_OWNER) continue
            const postId = JSON.stringify([post.source, post.profileUrl, post.id])
            if (seen.has(postId)) continue
            seen.add(postId)
            posts.push(post)
            byOwner.set(target.owner, (byOwner.get(target.owner) ?? 0) + 1)
          }
        }
      } catch {
        const unknown = { ...baseEvent, postCount: posts.length, reason: 'collection_outcome_unknown' as const }
        await appendEvent(em, scope, await discoveryRunWorkflowId(container, input), input.userId, UNKNOWN, unknown)
        return savedStatus(UNKNOWN, unknown, false, null)
      }

      const workflowInstanceId = await discoveryRunWorkflowId(container, input)
      if (!posts.length) {
        const failed = { ...baseEvent, reason: (knownFailures ? 'scrape_failed' : 'no_posts_collected') as 'scrape_failed' | 'no_posts_collected' }
        await appendEvent(em, scope, workflowInstanceId, input.userId, FAILED, failed)
        return savedStatus(FAILED, failed, false, null)
      }

      try {
        const intake = await container.resolve<StaffTovIntakeService>(STAFF_TOV_INTAKE_SERVICE).start({
          ...scope,
          userId: input.userId,
          caseId: discovery.caseId,
          eventId: intakeEventId(input.discoveryRunId, id),
          brand: discovery.brand,
          outputLanguage: discovery.outputLanguage,
          file: {
            buffer: Buffer.from(JSON.stringify(posts)),
            fileName: `tov-discovery-${input.discoveryRunId}.json`,
            mimeType: 'application/json',
          },
        })
        const completed = {
          ...baseEvent,
          postCount: posts.length,
          reason: 'normalized_corpus_handed_to_intake' as const,
          intakeWorkflowInstanceId: intake.workflowInstanceId,
        }
        await appendEvent(em, scope, workflowInstanceId, input.userId, COMPLETED, completed)
        return savedStatus(COMPLETED, completed, false, intake)
      } catch {
        const unknown = { ...baseEvent, postCount: posts.length, reason: 'intake_outcome_unknown' as const }
        await appendEvent(em, scope, workflowInstanceId, input.userId, UNKNOWN, unknown)
        return savedStatus(UNKNOWN, unknown, false, null)
      }
    },
  }
}

async function discoveryRunWorkflowId(container: AppContainer, input: CollectionInput): Promise<string> {
  const em = container.resolve<EntityManager>('em')
  const agencyCase = await readPaidDiscoveryCase(em, {
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  }, input.caseId)
  if (!agencyCase.workflowInstanceId) conflict()
  return agencyCase.workflowInstanceId
}

