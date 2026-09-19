import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getWorkflowInstance } from '@open-mercato/core/modules/workflows/lib/workflow-executor'
import { findDefinitionForInstance } from '@open-mercato/core/modules/workflows/lib/find-definition'
import { AgencyTovDocument, AgencyTovResearchRun } from '../../../data/entities'
import { readRevisionPolicy } from '../policy'
import { runTovRevision } from '../run'
import { readRevisionEvidence } from '../read'
import { finishResearchRun, saveDocumentVersion, startResearchRun } from '../../store'
import type { TovRevisionInput } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/workflow-executor', () => ({ getWorkflowInstance: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/find-definition', () => ({ findDefinitionForInstance: jest.fn() }))
jest.mock('../read', () => ({ readRevisionEvidence: jest.fn() }))
jest.mock('../../store', () => ({ startResearchRun: jest.fn(), saveDocumentVersion: jest.fn(), finishResearchRun: jest.fn(), citationsOf: jest.fn(() => []) }))

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, '0')}`
const scope = { tenantId: id(1), organizationId: id(2) }
const policy = { enabled: true as const, maxAgentCalls: 1 as const, runTimeoutMs: 60000, definitionId: id(3), definitionVersion: 2 }
const input: TovRevisionInput = { context: { ...scope, userId: id(4), workflowInstanceId: id(5), stepId: 'revise', invocationId: id(6) },
  executionPolicy: policy, request: { requestId: id(7), previous: { owner: 'agency_tov', kind: 'KLI-TOV', researchRunId: id(8), documentId: id(9), versionId: id(10), version: '1.0' },
    briefVersionId: id(11), strategyVersionId: id(12), source: { kind: 'pair_qa', qaTaskRunId: id(13) }, instructions: 'Make the summary concrete.', affectedFields: ['summary'] } }
const body = {
  brand: 'Brand', summary: 'Original summary', positioning: 'Original position', personality: 'Original personality',
  voicePillars: [{ name: 'Direct', description: 'Concrete', doThis: 'Examples', notThat: 'Jargon' }],
  sharedTraits: [], tensions: [], register: { formality: 2, warmth: 4, confidence: 4, humor: 2, technicality: 3, summary: 'Direct' },
  addressingTheReader: 'You', emotions: 'Calm', boundaries: ['No guarantees'], languagePolicy: 'English',
  vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'Low' },
  postFormats: [{ name: 'Lesson', whenToUse: 'After a project', skeleton: 'Context then lesson' }],
  hooks: { patterns: [], examples: [] }, closers: { patterns: [], ctaStyle: 'Soft' },
  formatting: { emoji: 'None', hashtags: 'None', mentions: 'None', links: 'None', capsAndPunctuation: 'Plain' },
  personaVariants: [], doList: [], dontList: [], exemplars: [{ postId: 'post', profileUrl: 'https://example.com/profile', quote: 'We shipped it.', whyItWorks: 'Concrete' }],
  counterExamples: [{ rule: 'Concrete', wrong: 'Best ever', right: 'This result' }], qaChecklist: [], confidence: 0.8,
}

beforeEach(() => jest.clearAllMocks())

it('accepts only the explicit policy pinned to the scoped running native definition', async () => {
  const em = {} as EntityManager
  jest.mocked(getWorkflowInstance).mockResolvedValue({ ...scope, id: id(5), definitionId: id(3), version: 2, status: 'RUNNING' } as never)
  jest.mocked(findDefinitionForInstance).mockResolvedValue({ ...scope, id: id(3), version: 2, enabled: true,
    definition: { transitions: [{ activities: [{ activityType: 'EXECUTE_FUNCTION', config: { functionName: 'agency_operations.reviseToneOfVoice',
      args: { policy: { agencyTovRevision: { enabled: true, maxAgentCalls: 1, runTimeoutMs: 60000 } } } } }] }] } } as never)
  expect(await readRevisionPolicy(em, input)).toEqual(policy)
  expect(await readRevisionPolicy(em, { ...input, executionPolicy: undefined })).toBeNull()
  expect(await readRevisionPolicy(em, { ...input, executionPolicy: { ...policy, definitionVersion: 3 } })).toBeNull()
  expect(await readRevisionPolicy(em, { ...input, context: { ...input.context, tenantId: id(99) } })).toBeNull()
})

it('uses one specialist call, preserves unaffected fields and replays the saved immutable outcome', async () => {
  const em: EntityManager = { transactional: jest.fn(async (work: (manager: EntityManager) => unknown) => work(em)), flush: jest.fn() } as unknown as EntityManager
  const document = { ...scope, id: id(9), kind: 'KLI-TOV', brand: 'Brand', title: 'Brand voice', currentVersionId: id(10) }
  const run = { id: id(14), status: 'running', stats: null as unknown }
  let claimed = false
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, where) => {
    if (entity === AgencyTovDocument) return document as never
    const filter = where as Record<string, unknown>
    if (entity === AgencyTovResearchRun && (filter.id === run.id || (claimed && filter.runner === `orchestrator:revision:${id(7)}`))) return run as never
    return null
  })
  const voice = { ...body, language: { primary: 'en', notes: 'English' }, pointOfView: 'First person',
    rhythm: { typicalPostLength: 'short', sentenceLength: 'Short', paragraphing: 'One-liners', listsAndLineBreaks: 'Rare' },
    structures: [], themes: { topics: [], stances: [], values: [] }, engagementInsights: [], evolution: 'Stable', postSkeletons: [],
    voicePillars: [{ name: 'Direct', description: 'Concrete', evidence: [] }], exemplars: [{ postId: 'post', quote: 'We shipped it.', whyTypical: 'Concrete' }] }
  jest.mocked(readRevisionEvidence).mockResolvedValue({ previous: { ...input.request.previous, brand: 'Brand', isCurrent: true, body, renderedMd: '# Original', citations: [] },
    corpus: { posts: [{ id: 'post', source: 'linkedin', profileUrl: 'https://example.com/profile', authorName: 'Person', url: 'https://example.com/post', postedAt: '2026-01-01T00:00:00Z', text: 'We shipped it.', likes: 0, comments: 0, shares: 0, media: 'none' }], sources: [], rowIds: [id(20)], rowOf: () => null },
    profiles: [{ profile: { source: 'linkedin', profileUrl: 'https://example.com/profile', displayName: 'Person', postCount: 1, firstPostedAt: '2026-01-01T00:00:00Z', lastPostedAt: '2026-01-01T00:00:00Z' }, voice }], profileVersionIds: [id(21)], outputLanguage: 'en' } as Awaited<ReturnType<typeof readRevisionEvidence>>)
  jest.mocked(startResearchRun).mockImplementation(async () => { claimed = true; return run as never })
  jest.mocked(saveDocumentVersion).mockImplementation(async () => {
    document.currentVersionId = id(15)
    return { document, version: { id: id(15), versionNo: 2 } } as never
  })
  jest.mocked(finishResearchRun).mockImplementation(async (_em, saved, outcome) => {
    saved.status = outcome.status
    if (outcome.status === 'done') saved.stats = outcome.stats
  })
  const runAgent = jest.fn(async () => ({ kind: 'research' as const, data: { ...body, summary: 'Revised summary', personality: 'Unrequested rewrite' } }))
  const args = { em, scope, request: input.request, executionPolicy: policy, runAgent, agentRunIds: [id(16)] }
  const result = await runTovRevision(args)
  expect(result).toMatchObject({ status: 'completed', reference: { versionId: id(15), version: '2.0' }, changedFields: ['summary'], replayed: false })
  expect(saveDocumentVersion).toHaveBeenCalledWith(expect.anything(), scope, expect.objectContaining({ body: { ...body, summary: 'Revised summary' } }))
  expect(runAgent).toHaveBeenCalledWith('agency_tov.brand_synthesizer', expect.objectContaining({ correction: expect.objectContaining({ previous: body, affectedFields: ['summary'] }) }), { runTimeoutMs: 60000 })
  expect(await runTovRevision(args)).toEqual({ ...result, replayed: true })
  expect(runAgent).toHaveBeenCalledTimes(1)
  await expect(runTovRevision({ ...args, request: { ...input.request, instructions: 'Different request' } })).rejects.toThrow('differs from its saved source')
})
