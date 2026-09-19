/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchTaskRun } from '../../../data/entities'
import { startTaskRun } from '../../store'
import { claimMaterialRevision } from '../claim'
import type { MaterialRevisionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn() }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const request: MaterialRevisionRequest = { orderRef: 'case', briefVersionId: id(1), source: { submissionId: id(2), eventId: 'upload', customerUserId: id(3), workflowInstanceId: id(4) },
  material: { attachmentId: id(5), submissionId: id(2), fileName: 'file.txt', text: 'private material', submittedAt: '2026-09-19T12:00:00.000Z' },
  directive: { question: 'What is documented?', briefField: 'priority_offer' }, maxCostPln: 1 }
const scope = { tenantId: id(6), organizationId: id(7) }
const task = { orderRef: 'case', brand: 'Client', stepId: '4.5', attempt: 1, runner: 'orchestrator', models: {}, inputVersions: [] }
const flush = jest.fn()
const em = { flush, transactional: async (work: (manager: EntityManager) => unknown) => work(em) } as unknown as EntityManager
let parent: { currentVersionId: string; status: string }
let runs: AgencyResearchTaskRun[]

beforeEach(() => {
  jest.clearAllMocks()
  parent = { currentVersionId: request.briefVersionId, status: 'ready_for_review' }; runs = []
  jest.mocked(findWithDecryption).mockImplementation(async () => runs as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => entity === AgencyResearchDocument && (query as { templateId: unknown }).templateId === 'WZR-BRIEF' ? parent as never : null)
  jest.mocked(startTaskRun).mockImplementation(async () => { const run = Object.assign(new AgencyResearchTaskRun(), { id: id(8), status: 'running', summary: null }); runs.push(run); return run })
})

it('claims once and uses native draft availability to prevent old-version approval during execution', async () => {
  await expect(claimMaterialRevision(em, scope, request, task)).resolves.toEqual({ activationTaskRunId: id(8) })
  expect(parent.status).toBe('draft')
  await expect(claimMaterialRevision(em, scope, request, task)).resolves.toMatchObject({ existing: { status: 'execution_incomplete', activationTaskRunId: id(8) } })
  expect(startTaskRun).toHaveBeenCalledTimes(1)
})

it.each(['approved', 'blocked'])('does not change a %s brief or start work', async (status) => {
  parent.status = status
  await expect(claimMaterialRevision(em, scope, request, task)).resolves.toMatchObject({ existing: { status: 'not_ready', reason: 'brief_not_reviewable' } })
  expect(parent.status).toBe(status)
  expect(startTaskRun).not.toHaveBeenCalled()
})

it('rejects a superseded version before creating the task', async () => {
  parent.currentVersionId = id(9)
  await expect(claimMaterialRevision(em, scope, request, task)).resolves.toMatchObject({ existing: { reason: 'brief_not_current' } })
  expect(startTaskRun).not.toHaveBeenCalled()
})
