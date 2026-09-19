import { WorkflowEvent, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { logWorkflowEvent } from '@open-mercato/core/modules/workflows/lib/event-logger'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_TOV_WORKFLOW_ID } from '../../tovProcess'
import { STAFF_TOV_INTAKE_SERVICE } from '../../tovIntake/contracts'
import {
  TOV_DISCOVERY_COLLECTION_ENABLED,
  TOV_COLLECTION_POSTS_PER_OWNER,
  createTovCollectionService,
} from '../collection'
import { createTovDiscoveryService, readPaidDiscoveryCase } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/event-logger', () => ({ logWorkflowEvent: jest.fn() }))
jest.mock('../service', () => {
  const actual = jest.requireActual('../service')
  return { ...actual, createTovDiscoveryService: jest.fn(), readPaidDiscoveryCase: jest.fn() }
})

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const userId = uuid(3), caseId = uuid(4), customerEntityId = uuid(5), analysisId = uuid(6), discoveryRunId = uuid(7), intakeId = uuid(8)
const linkedinTargetId = 'a'.repeat(24), xTargetId = 'b'.repeat(24)

const target = (targetId: string, source: 'linkedin' | 'x', url: string) => ({
  targetId, source, url, owner: 'Person', material: 'posts', confidence: 0.9,
  evidenceUrl: 'https://example.test/about', collectorSupported: true, meetsMinimumConfidence: true,
})

const discovery = {
  discoveryRunId,
  caseId,
  customerEntityId,
  runStatus: 'ok' as const,
  state: 'completed' as const,
  replayed: true,
  brand: 'Example',
  outputLanguage: 'pl' as const,
  minimumConfidence: 0.6 as const,
  notes: 'Saved scout result.',
  targets: [
    target(linkedinTargetId, 'linkedin', 'https://linkedin.com/in/person'),
    target(xTargetId, 'x', 'https://x.com/person'),
  ],
  collectorAvailable: true,
  collectorCandidateCount: 2,
  handoff: {
    state: 'awaiting_staff_corpus' as const,
    corpusReady: false as const,
    intakeStarted: false as const,
    reason: 'source_scout_returns_targets_not_normalized_corpus' as const,
    nextAction: 'review_targets_collect_and_upload_normalized_corpus' as const,
    suppliedCorpusEndpoint: '/api/agency_operations/tov-intakes' as const,
  },
}

const post = (id: string) => ({
  id, source: 'linkedin' as const, profileUrl: 'https://linkedin.com/in/person', authorName: 'Person',
  url: `https://linkedin.com/posts/${id}`, postedAt: '2026-09-19', text: `Post ${id}`,
  likes: 1, comments: 0, shares: 0, media: 'none' as const,
})

function fixture(scrapeResult: { posts: ReturnType<typeof post>[]; error: string | null } = {
  posts: Array.from({ length: 10 }, (_, index) => post(`post-${index}`)), error: null,
}) {
  const events: WorkflowEvent[] = []
  const em = {
    transactional: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(em)),
    find: jest.fn(async () => events),
  }
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    const query = where as Record<string, unknown>
    if (entity === WorkflowInstance && query.id === analysisId) return Object.assign(new WorkflowInstance(), {
      id: analysisId, ...scope, workflowId: 'agency_operations.analysis.v1', context: { caseId, customerEntityId },
    }) as never
    if (entity === WorkflowInstance && query.workflowId === AGENCY_TOV_WORKFLOW_ID) return null
    return null
  })
  jest.mocked(logWorkflowEvent).mockImplementation(async (_em, value) => {
    const event = Object.assign(new WorkflowEvent(), { id: String(events.length + 1), occurredAt: new Date(), ...value })
    events.push(event)
    return event
  })
  jest.mocked(readPaidDiscoveryCase).mockResolvedValue({ id: caseId, ...scope, customerEntityId, workflowInstanceId: analysisId } as never)
  const getDiscovery = jest.fn(async () => discovery)
  jest.mocked(createTovDiscoveryService).mockReturnValue({ get: getDiscovery } as never)
  const available = jest.fn(() => true)
  const sourceOf = jest.fn((url: string) => url.includes('linkedin.com') ? 'linkedin' : url.includes('x.com') ? 'x' : null)
  const scrape = jest.fn(async (_input: { url: string; maxPosts: number }) => ({ actorId: 'teammate/actor', items: scrapeResult.posts.length, ...scrapeResult }))
  const intakeStatus = {
    intakeId: uuid(9), caseId, customerEntityId, workflowInstanceId: intakeId,
    workflowStatus: 'WAITING_FOR_ACTIVITIES', currentStep: 'tov_research', state: 'running' as const,
    replayed: false, result: null,
  }
  const start = jest.fn(async (_input: Record<string, any>) => intakeStatus)
  const get = jest.fn(async (_input: Record<string, any>) => ({ ...intakeStatus, replayed: true }))
  const userHasAllFeatures = jest.fn(async () => true)
  const services: Record<string, unknown> = {
    em,
    rbacService: { userHasAllFeatures },
    agencyTovCorpusScraper: { available, sourceOf, scrape },
    agencyTovResearchService: {},
    workflowDefinitionAuthoring: { findOwnedDefinition: jest.fn(async () => ({
      enabled: true, metadata: { generatedBy: { module: 'agency_operations' } }, grantedFeatures: ['agency_tov.manage'],
    })) },
    [STAFF_TOV_INTAKE_SERVICE]: { start, get },
  }
  const container = {
    resolve: jest.fn((name: string) => services[name]),
    hasRegistration: jest.fn((name: string) => name in services),
  }
  return { container, events, available, scrape, start, get, sourceOf }
}

const request = {
  ...scope,
  userId,
  caseId,
  discoveryRunId,
  eventId: 'staff-collection-1',
  targetIds: [linkedinTargetId, xTargetId],
}

describe('staff-selected ToV discovery collection', () => {
  const previousCollection = process.env[TOV_DISCOVERY_COLLECTION_ENABLED]
  const previousExecution = process.env.AGENCY_TOV_EXECUTION_ENABLED
  beforeEach(() => {
    jest.clearAllMocks()
    process.env[TOV_DISCOVERY_COLLECTION_ENABLED] = 'true'
    process.env.AGENCY_TOV_EXECUTION_ENABLED = 'true'
  })
  afterAll(() => {
    if (previousCollection === undefined) delete process.env[TOV_DISCOVERY_COLLECTION_ENABLED]
    else process.env[TOV_DISCOVERY_COLLECTION_ENABLED] = previousCollection
    if (previousExecution === undefined) delete process.env.AGENCY_TOV_EXECUTION_ENABLED
    else process.env.AGENCY_TOV_EXECUTION_ENABLED = previousExecution
  })

  it('blocks new collection before scraper or intake work when the gate defaults off', async () => {
    delete process.env[TOV_DISCOVERY_COLLECTION_ENABLED]
    const test = fixture()
    await expect(createTovCollectionService(test.container as never).collect(request)).rejects.toMatchObject({ status: 409 })
    expect(createTovDiscoveryService).toHaveBeenCalledTimes(1)
    expect(test.scrape).not.toHaveBeenCalled()
    expect(test.start).not.toHaveBeenCalled()
  })

  it('collects only exact saved targets, caps one owner at eight posts, and replays the saved handoff without another scrape', async () => {
    const test = fixture()
    const service = createTovCollectionService(test.container as never)
    const first = await service.collect(request)
    delete process.env[TOV_DISCOVERY_COLLECTION_ENABLED]
    test.available.mockReturnValue(false)
    const replay = await service.collect(request)

    expect(test.scrape).toHaveBeenCalledTimes(1)
    expect(test.scrape).toHaveBeenCalledWith({ url: 'https://linkedin.com/in/person', maxPosts: TOV_COLLECTION_POSTS_PER_OWNER })
    expect(test.start).toHaveBeenCalledTimes(1)
    const intakeInput = test.start.mock.calls[0][0]
    const corpus = JSON.parse(intakeInput.file.buffer.toString('utf8'))
    expect(corpus).toHaveLength(TOV_COLLECTION_POSTS_PER_OWNER)
    expect(intakeInput).toMatchObject({ ...scope, userId, caseId, brand: 'Example', outputLanguage: 'pl' })
    expect(first).toMatchObject({ state: 'completed', replayed: false, postCount: 8,
      reason: 'normalized_corpus_handed_to_intake', intake: { workflowInstanceId: intakeId } })
    expect(replay).toMatchObject({ state: 'completed', replayed: true, postCount: 8,
      reason: 'normalized_corpus_handed_to_intake', intake: { workflowInstanceId: intakeId } })
    expect(test.events.map((event) => event.eventType)).toEqual([
      'AGENCY_TOV_COLLECTION_REQUESTED', 'AGENCY_TOV_COLLECTION_COMPLETED',
    ])
  })

  it('rejects a substituted target ID before scraper or intake work', async () => {
    const test = fixture()
    await expect(createTovCollectionService(test.container as never).collect({
      ...request,
      targetIds: ['c'.repeat(24)],
    })).rejects.toMatchObject({ status: 409 })

    expect(test.scrape).not.toHaveBeenCalled()
    expect(test.start).not.toHaveBeenCalled()
    expect(test.events).toHaveLength(0)
  })

  it('saves a known empty scrape failure and never bills the same event twice', async () => {
    const test = fixture({ posts: [], error: 'adapter returned no data' })
    const service = createTovCollectionService(test.container as never)
    const first = await service.collect({ ...request, targetIds: [linkedinTargetId] })
    const replay = await service.collect({ ...request, targetIds: [linkedinTargetId] })

    expect(first).toMatchObject({ state: 'attention_required', replayed: false, postCount: 0, reason: 'scrape_failed' })
    expect(replay).toMatchObject({ state: 'attention_required', replayed: true, postCount: 0, reason: 'scrape_failed' })
    expect(test.scrape).toHaveBeenCalledTimes(1)
    expect(test.start).not.toHaveBeenCalled()
    expect(test.events.map((event) => event.eventType)).toEqual([
      'AGENCY_TOV_COLLECTION_REQUESTED', 'AGENCY_TOV_COLLECTION_FAILED',
    ])
  })
})

