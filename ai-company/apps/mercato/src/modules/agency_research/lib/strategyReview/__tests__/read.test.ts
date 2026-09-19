/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { readStrategyReview } from '../read'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))

const em = {} as EntityManager
const scope = { tenantId: 'tenant', organizationId: 'organization' }
const orderRef = 'case'
const findOne = jest.mocked(findOneWithDecryption)
const findMany = jest.mocked(findWithDecryption)
const pin = (document: string, version = '1.0') => ({ document_id: `${document}@${orderRef}`, version })
let documents: AgencyResearchDocument[]
let versions: AgencyResearchDocumentVersion[]
let runs: AgencyResearchTaskRun[]

function run(overrides: Partial<AgencyResearchTaskRun> = {}) {
  return Object.assign(new AgencyResearchTaskRun(), {
    ...scope, id: 'qa', orderRef, stepId: '5.4', status: 'done', outputVersionId: 'strategy-version',
    inputVersions: [pin('KLI-STRATEGIA'), pin('KLI-TOV'), pin('KLI-BRIEF')],
    qaResult: { verdict: 'ready_for_approval', findings: ['Internal finding'], summary: 'Private summary' },
  }, overrides)
}

beforeEach(() => {
  jest.clearAllMocks()
  documents = ['STRATEGIA', 'TOV', 'BRIEF'].map((name, index) => Object.assign(new AgencyResearchDocument(), {
    ...scope, orderRef, id: ['strategy-doc', 'tov-doc', 'brief-doc'][index], templateId: `WZR-${name}`,
    currentVersionId: ['strategy-version', 'tov-version', 'brief-version'][index], status: 'ready_for_review',
  }))
  versions = documents.map((document) => Object.assign(new AgencyResearchDocumentVersion(), {
    ...scope, orderRef, id: document.currentVersionId, documentId: document.id, templateId: document.templateId,
    versionNo: 1, status: 'draft', clientViewMd: `# ${document.templateId}`, simulationFlag: false,
    data: { private: 'Do not expose' }, renderedMd: 'Internal document',
    inputVersions: document.templateId === 'WZR-TOV' ? [pin('KLI-BRIEF'), pin('KLI-STRATEGIA')] : [pin('KLI-BRIEF')],
  }))
  runs = [run()]
  findOne.mockImplementation(async (_em, entity, query) => {
    const rows = entity === AgencyResearchDocument ? documents : versions
    const filter = query as Record<string, unknown>
    return (rows.find((row) => Object.entries(filter).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  findMany.mockImplementation(async () => runs as never)
})

function read() { return readStrategyReview(em, scope, orderRef, 'strategy-version', 'tov-version') }

test('returns the exact pair, same-run QA and shared brief without internal content or an acceptance claim', async () => {
  const result = await read()
  expect(result).toMatchObject({
    orderRef, tovUsesStrategy: true,
    strategy: { documentId: 'strategy-doc', versionId: 'strategy-version', templateId: 'WZR-STRATEGIA', version: '1.0', clientViewMd: '# WZR-STRATEGIA', isCurrent: true, simulationFlag: false },
    tov: { documentId: 'tov-doc', versionId: 'tov-version', templateId: 'WZR-TOV', clientViewMd: '# WZR-TOV', isCurrent: true, simulationFlag: false },
    qa: { state: 'assessed', taskRunId: 'qa', status: 'done', verdict: 'ready_for_approval' },
    brief: { documentId: 'brief-doc', versionId: 'brief-version', version: '1.0', isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'draft', simulationFlag: false },
  })
  expect(result?.brief).not.toHaveProperty('clientViewMd')
  expect(result?.strategy).not.toHaveProperty('data')
  expect(result?.qa).not.toHaveProperty('findings')
  expect(result).not.toHaveProperty('accepted')
  for (const call of findOne.mock.calls) {
    expect(call[2]).toMatchObject({ ...scope, orderRef })
    expect(call[4]).toEqual(scope)
  }
  expect(findOne).toHaveBeenCalledWith(em, AgencyResearchDocumentVersion, {
    ...scope, orderRef, id: 'strategy-version', documentId: 'strategy-doc', templateId: 'WZR-STRATEGIA',
  }, undefined, scope)
  expect(findMany).toHaveBeenCalledWith(em, AgencyResearchTaskRun, { ...scope, orderRef, stepId: '5.4' }, { orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
})

test.each(['tenantId', 'organizationId', 'orderRef', 'documentId', 'templateId'])('refuses a pair version with foreign %s', async (field) => {
  Object.assign(versions[1], { [field]: 'foreign' })
  expect(await read()).toBeNull()
  expect(findMany).not.toHaveBeenCalled()
})

test('returns null for a deleted pair document', async () => {
  documents[0].deletedAt = new Date()
  expect(await read()).toBeNull()
})

test('keeps each stale pointer and simulation flag explicit despite historical clean QA', async () => {
  for (const document of documents) document.currentVersionId = 'newer-version'
  for (const version of versions) version.simulationFlag = true
  expect(await read()).toMatchObject({
    strategy: { isCurrent: false, simulationFlag: true }, tov: { isCurrent: false, simulationFlag: true },
    brief: { isCurrent: false, simulationFlag: true }, qa: { state: 'assessed' },
  })
})

test('does not combine QA runs that each checked only one requested pair member', async () => {
  runs = [
    run({ inputVersions: [pin('KLI-STRATEGIA'), pin('KLI-TOV', '2.0'), pin('KLI-BRIEF')] }),
    run({ inputVersions: [pin('KLI-STRATEGIA', '2.0'), pin('KLI-TOV'), pin('KLI-BRIEF')] }),
  ]
  expect(await read()).toMatchObject({ qa: { state: 'missing' }, brief: null })
})

test.each(['failed', 'running', 'paused_budget'])('latest exact-pair %s attempt supersedes old passed QA', async (status) => {
  runs = [run({ id: 'newer-qa', status, outputVersionId: null, qaResult: null }), run()]
  expect(await read()).toMatchObject({ qa: { state: 'unavailable', taskRunId: 'newer-qa', status } })
})

test.each([
  ['to_fix', 'needs_agent_fix', 'strategy-version', 'assessed'],
  ['done', 'needs_agent_fix', 'strategy-version', 'unavailable'],
  ['done', 'unknown', 'strategy-version', 'unavailable'],
  ['done', 'ready_for_approval', 'other-output', 'unavailable'],
])('preserves QA %s/%s with output %s as %s', async (status, verdict, outputVersionId, state) => {
  runs = [run({ status, qaResult: { verdict }, outputVersionId })]
  expect((await read())?.qa).toEqual(state === 'assessed'
    ? { state, taskRunId: 'qa', status, verdict }
    : { state, taskRunId: 'qa', status })
})

test('exposes a ToV built from a different strategy without pretending it used the reviewed version', async () => {
  versions[1].inputVersions = [pin('KLI-BRIEF'), pin('KLI-STRATEGIA', '2.0')]
  expect(await read()).toMatchObject({ tovUsesStrategy: false })
})

test.each(['strategy', 'tov', 'qa'])('requires the %s brief basis to match every pair participant', async (participant) => {
  if (participant === 'strategy') versions[0].inputVersions = [pin('KLI-BRIEF', '2.0')]
  if (participant === 'tov') versions[1].inputVersions = [pin('KLI-BRIEF', '2.0'), pin('KLI-STRATEGIA')]
  if (participant === 'qa') runs[0].inputVersions = [pin('KLI-STRATEGIA'), pin('KLI-TOV'), pin('KLI-BRIEF', '2.0')]
  expect(await read()).toMatchObject({ brief: null })
})

test('does not fabricate client Markdown when the persisted view is missing', async () => {
  versions[1].clientViewMd = null
  expect(await read()).toMatchObject({ tov: { clientViewMd: null } })
})
