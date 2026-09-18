/** @jest-environment node */

import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyTovDocument, AgencyTovDocumentVersion } from '@/modules/agency_tov/data/entities'
import { AgencyCase } from '../../data/entities'

const findOne = jest.fn()
const findMany = jest.fn()
const getCase = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
  findWithDecryption: (...args: unknown[]) => findMany(...args),
}))

import { createClientArtifactService } from '../clientArtifactService'

const ids = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003',
  customerUserId: '00000000-0000-4000-8000-000000000004',
  caseId: '00000000-0000-4000-8000-000000000005',
  workflowId: '00000000-0000-4000-8000-000000000006',
  versionId: '00000000-0000-4000-8000-000000000007',
  documentId: '00000000-0000-4000-8000-000000000008',
  researchRunId: '00000000-0000-4000-8000-000000000009',
}
const identity = {
  tenantId: ids.tenantId, organizationId: ids.organizationId,
  customerEntityId: ids.customerEntityId, customerUserId: ids.customerUserId,
}
const scope = { tenantId: ids.tenantId, organizationId: ids.organizationId }
const em = {}
const container = { resolve: (key: string) => key === 'em' ? em : { get: getCase } } as unknown as AppContainer
const timestamp = new Date('2026-09-19T08:00:00Z')
const body = {
  brand: 'Acme', summary: 'Clear voice', positioning: 'Useful', personality: 'Warm',
  voicePillars: [{ name: 'Clarity', description: 'Be specific', doThis: 'Examples', notThat: 'Jargon', evidence: ['private'] }],
  sharedTraits: [], tensions: [],
  register: { formality: 2, warmth: 4, confidence: 3, humor: 2, technicality: 3, summary: 'Direct' },
  addressingTheReader: 'You', emotions: 'Calm', boundaries: [], languagePolicy: 'English',
  vocabulary: { signaturePhrases: [], favouredWords: [], avoided: [], jargonLevel: 'Low' },
  postFormats: [{ name: 'Update', whenToUse: 'News', skeleton: 'What changed' }],
  closers: { patterns: [], ctaStyle: 'Invite discussion' },
  formatting: { emoji: 'Few', hashtags: 'Few', mentions: 'Relevant', links: 'Useful', capsAndPunctuation: 'Normal' },
  doList: ['Be clear'], dontList: ['Overpromise'], counterExamples: [{ rule: 'Concrete', wrong: 'Best', right: 'Three steps' }],
  hooks: { patterns: ['Question'], examples: ['private source quote'] },
  personaVariants: [{ profileUrl: 'private-profile-url', displayName: 'Author', howTheyDiffer: 'Technical', whenToWriteAsThem: 'Engineering' }],
  exemplars: [{ postId: 'private-evidence', quote: 'private quote' }], qaChecklist: ['internal QA'], confidence: 0.9,
}

beforeEach(() => {
  jest.clearAllMocks()
  getCase.mockResolvedValue({ caseId: ids.caseId })
  findOne.mockImplementation((_em: unknown, entity: unknown) => {
    if (entity === AgencyCase) return { id: ids.caseId, workflowInstanceId: ids.workflowId }
    if (entity === WorkflowInstance) return { context: { research_tov_result: { result: {
      researchRunId: ids.researchRunId, documentVersionIds: [ids.versionId], agentRunIds: ['private-run'],
    } } } }
    throw new Error('Unexpected entity')
  })
  findMany.mockImplementation((_em: unknown, entity: unknown) => {
    if (entity === AgencyTovDocumentVersion) return [{
      id: ids.versionId, documentId: ids.documentId, versionNo: 2, createdAt: timestamp,
      body: JSON.stringify(body), renderedMd: 'private markdown', citations: ['private citation'],
    }]
    if (entity === AgencyTovDocument) return [{ id: ids.documentId, title: 'Tone of voice', currentVersionId: 'another-version' }]
    throw new Error('Unexpected entity')
  })
})

it('reads the exact linked version and strips evidence, QA and raw renderings', async () => {
  const service = createClientArtifactService(container)
  const artifact = await service.get(identity, ids.caseId, ids.versionId)
  expect(getCase).toHaveBeenCalledWith(identity, ids.caseId)
  expect(artifact).toMatchObject({
    caseId: ids.caseId, documentId: ids.documentId, versionId: ids.versionId,
    versionNo: 2, kind: 'KLI-TOV', contentFormat: 'tov-brand-json',
    content: { summary: 'Clear voice', hooks: { patterns: ['Question'] } },
  })
  expect(artifact?.content.personaVariants).toEqual([{ displayName: 'Author', howTheyDiffer: 'Technical', whenToWriteAsThem: 'Engineering' }])
  const serialized = JSON.stringify(artifact)
  expect(serialized).not.toMatch(/private|currentVersion|isCurrent|approved|qaChecklist|renderedMd/)
  expect(findOne).toHaveBeenCalledWith(em, AgencyCase, {
    id: ids.caseId, ...scope, customerEntityId: ids.customerEntityId, deletedAt: null,
  }, expect.anything(), scope)
  expect(findOne).toHaveBeenCalledWith(em, WorkflowInstance, {
    id: ids.workflowId, ...scope, workflowId: 'agency_operations.tov-research.v1', deletedAt: null,
  }, expect.anything(), scope)
  expect(findMany).toHaveBeenCalledWith(em, AgencyTovDocumentVersion, {
    id: ids.versionId, ...scope, researchRunId: ids.researchRunId,
  }, expect.anything(), scope)
  expect(findMany).toHaveBeenCalledWith(em, AgencyTovDocument, {
    id: { $in: [ids.documentId] }, ...scope, kind: 'KLI-TOV', deletedAt: null,
  }, expect.anything(), scope)
})

it('denies another customer’s case before reading workflow or artifacts', async () => {
  getCase.mockResolvedValue(null)
  await expect(createClientArtifactService(container).get(identity, ids.caseId, ids.versionId))
    .rejects.toMatchObject({ status: 404 })
  expect(findOne).not.toHaveBeenCalled()
  expect(findMany).not.toHaveBeenCalled()
})

it('does not follow the document’s current pointer or accept another version id', async () => {
  expect(await createClientArtifactService(container).get(identity, ids.caseId, ids.documentId)).toBeNull()
  expect(findMany).not.toHaveBeenCalled()
})

it('lists metadata only and excludes internal profile documents', async () => {
  const service = createClientArtifactService(container)
  expect(await service.list(identity, ids.caseId)).toEqual([{
    caseId: ids.caseId, documentId: ids.documentId, versionId: ids.versionId, versionNo: 2,
    kind: 'KLI-TOV', title: 'Tone of voice', createdAt: timestamp.toISOString(),
  }])
  findMany.mockImplementation((_em: unknown, entity: unknown) => entity === AgencyTovDocument ? [] : [{
    id: ids.versionId, documentId: ids.documentId, body: JSON.stringify(body), versionNo: 2, createdAt: timestamp,
  }])
  expect(await service.get(identity, ids.caseId, ids.versionId)).toBeNull()
})

it('returns no fabricated artifacts before research has persisted exact references', async () => {
  findOne.mockImplementation((_em: unknown, entity: unknown) => entity === AgencyCase
    ? { id: ids.caseId, workflowInstanceId: ids.workflowId } : { context: {} })
  expect(await createClientArtifactService(container).list(identity, ids.caseId)).toEqual([])
  expect(findMany).not.toHaveBeenCalled()
})
