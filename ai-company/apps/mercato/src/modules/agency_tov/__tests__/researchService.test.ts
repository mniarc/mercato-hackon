import type { EntityManager } from '@mikro-orm/postgresql'
import type { AgentRunCtx } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/runtime/agentRuntime'
import type { TovPost } from '../data/validators'
import { createAgencyTovResearchService } from '../lib/researchService'
import { finishResearchRun, importCorpus, loadCorpus, saveDocumentVersion, startResearchRun } from '../lib/store'
import { runTovPipeline, type TovPipelineOptions, type TovPipelineResult } from '../lib/tov/pipeline'

jest.mock('../lib/store', () => ({
  importCorpus: jest.fn(), loadCorpus: jest.fn(), startResearchRun: jest.fn(),
  finishResearchRun: jest.fn(), saveDocumentVersion: jest.fn(), citationsOf: jest.fn(() => []),
}))
jest.mock('../lib/tov/pipeline', () => ({ runTovPipeline: jest.fn() }))
jest.mock('../lib/tov/render', () => ({
  linkResolverFor: jest.fn(), renderBrandTov: jest.fn(() => '# Brand'), renderProfileVoice: jest.fn(() => '# Profile'),
}))

const scope = { tenantId: 'tenant', organizationId: 'org' }
const context: AgentRunCtx = {
  ...scope, userId: 'workflow-principal', workflowInstanceId: 'workflow', stepId: 'tov', invocationId: 'attempt',
  runAs: { agentUserId: 'workflow-principal', onBehalfOfUserId: null },
}
const post: TovPost = {
  id: 'supplied', source: 'linkedin', profileUrl: 'https://example.com/person', authorName: 'Person',
  url: 'https://example.com/post', postedAt: '2026-01-01T00:00:00Z', text: 'Our authentic source text.',
  likes: 0, comments: 0, shares: 0, media: 'none',
}
const result = { profiles: [], brand: {}, stats: {} } as TovPipelineResult

function fixture() {
  const em = {} as EntityManager
  const allowed = jest.fn().mockResolvedValue(true)
  const nativeRun = jest.fn(async (_id: string, _input: unknown, ctx: AgentRunCtx) => {
    ctx.onRunPersisted?.(`native-${ctx.invocationId}`)
    return { kind: 'research', data: {} }
  })
  const resolve = jest.fn((key: string): unknown => {
    if (key === 'em') return { fork: () => em }
    if (key === 'rbacService') return { userHasAllFeatures: allowed }
    if (key === 'agentRuntime') return { run: nativeRun }
    throw new Error(key)
  })
  jest.mocked(importCorpus).mockResolvedValue({} as Awaited<ReturnType<typeof importCorpus>>)
  jest.mocked(loadCorpus).mockResolvedValue({
    posts: [{ ...post, id: 'historical-not-requested' }, post], rowIds: ['old-row', 'requested-row'], sources: [], rowOf: () => null,
  })
  jest.mocked(startResearchRun).mockResolvedValue({ id: 'research' } as Awaited<ReturnType<typeof startResearchRun>>)
  jest.mocked(saveDocumentVersion).mockResolvedValue({ version: { id: 'version' } } as Awaited<ReturnType<typeof saveDocumentVersion>>)
  jest.mocked(runTovPipeline).mockImplementation(async (options: TovPipelineOptions) => {
    await options.runAgent('agency_tov.batch_analyst', {}, { runTimeoutMs: 1000 })
    await options.runAgent('agency_tov.brand_synthesizer', {}, { runTimeoutMs: 2000 })
    return result
  })
  return { service: createAgencyTovResearchService({ resolve }), em, allowed, nativeRun }
}

beforeEach(() => jest.clearAllMocks())

it('persists only requested corpus and returns exact native run/document IDs with workflow scope', async () => {
  const { service, em, allowed, nativeRun } = fixture()
  const output = await service.run({ context, brand: 'Brand', outputLanguage: 'en', posts: [post] })
  expect(allowed).toHaveBeenCalledWith(context.userId, ['agency_tov.manage', 'agent_orchestrator.agents.run'], scope)
  expect(importCorpus).toHaveBeenCalledWith(em, scope, expect.objectContaining({ corpus: { posts: [post], skipped: [] } }))
  expect(startResearchRun).toHaveBeenCalledWith(em, scope, expect.objectContaining({ corpus: expect.objectContaining({ posts: [post], rowIds: ['requested-row'] }) }))
  expect(nativeRun).toHaveBeenNthCalledWith(1, 'agency_tov.batch_analyst', {}, expect.objectContaining({ ...context, invocationId: 'attempt:0', runTimeoutMs: 1000 }))
  expect(nativeRun).toHaveBeenNthCalledWith(2, 'agency_tov.brand_synthesizer', {}, expect.objectContaining({ invocationId: 'attempt:1' }))
  expect(output).toEqual({ researchRunId: 'research', documentVersionIds: ['version'], agentRunIds: ['native-attempt:0', 'native-attempt:1'], result })
  expect(finishResearchRun).toHaveBeenCalledWith(em, { id: 'research' }, expect.objectContaining({ status: 'done' }))
})

it('marks the research failed when persistence fails, instead of returning a fabricated success', async () => {
  const { service, em } = fixture()
  jest.mocked(saveDocumentVersion).mockRejectedValueOnce(new Error('storage failure'))
  await expect(service.run({ context, brand: 'Brand', outputLanguage: 'pl', posts: [post] })).rejects.toThrow('storage failure')
  expect(finishResearchRun).toHaveBeenCalledWith(em, { id: 'research' }, expect.objectContaining({ status: 'failed', error: 'storage failure' }))
})

it('fails closed for missing execution scope or denied permission before writes or model calls', async () => {
  const { service, allowed, nativeRun } = fixture()
  const input = { context, brand: 'Brand', outputLanguage: 'en' as const, posts: [post] }
  await expect(service.run({ ...input, context: { ...context, userId: '' } })).rejects.toThrow('explicit tenant')
  allowed.mockResolvedValue(false)
  await expect(service.run(input)).rejects.toThrow('not authorized')
  expect(importCorpus).not.toHaveBeenCalled()
  expect(nativeRun).not.toHaveBeenCalled()
})

it('rejects conflicting immutable post text before starting research or calling agents', async () => {
  const { service, nativeRun } = fixture()
  jest.mocked(loadCorpus).mockResolvedValue({
    posts: [{ ...post, text: 'An older upload with the same source identity.' }],
    rowIds: ['existing-row'], sources: [], rowOf: () => null,
  })
  await expect(service.run({ context, brand: 'Brand', outputLanguage: 'en', posts: [post] }))
    .rejects.toThrow('conflicts with stored source text')
  expect(startResearchRun).not.toHaveBeenCalled()
  expect(nativeRun).not.toHaveBeenCalled()
})
