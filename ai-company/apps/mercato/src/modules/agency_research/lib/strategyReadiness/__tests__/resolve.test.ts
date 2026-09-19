/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { documentIdFor } from '../../research/envelope'
import { resolveStrategyReadiness } from '../resolve'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: (...args: unknown[]) => findOne(...args) }))

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const orderRef = uuid(3)
const acceptanceSubmissionId = uuid(4)
const briefVersionId = uuid(5)
const process = { workflowDefinitionId: uuid(6), workflowId: 'agency_operations.analysis.v1', version: 2 }
const input = { orderRef, briefVersionId, acceptanceSubmissionId, process }
const em = {} as EntityManager
type Row = Record<string, unknown>
let documents: Row[]
let versions: Row[]
let runs: Row[]
let brief: Row
let briefDocument: Row
let freeze: Row
let qa: Row
const templates = ['WZR-ZRODLA', 'WZR-AUDYT', 'WZR-KONKURENCJA', 'WZR-USTALENIA'] as const
const pins = templates.map((template) => ({ document_id: documentIdFor(template, orderRef), version: '1.0', status: 'ready_for_review' }))
const acceptance = {
  person: uuid(7), at: '2026-09-19T12:00:00.000Z', scope: 'brief', version: '1.0', documentVersionId: briefVersionId,
  source: { kind: 'agency_brief_acceptance', submissionId: acceptanceSubmissionId, eventId: 'client-event-1', workflowInstanceId: uuid(8), agentRunId: uuid(9), invitationTaskId: uuid(10) },
}

beforeEach(() => {
  jest.clearAllMocks()
  documents = templates.map((templateId, index) => ({ id: uuid(20 + index), ...scope, orderRef, templateId, currentVersionId: uuid(30 + index), status: 'ready_for_review', deletedAt: null }))
  versions = templates.map((templateId, index) => ({ id: uuid(30 + index), ...scope, orderRef, templateId, documentId: uuid(20 + index), versionNo: 1, status: 'ready_for_review', simulationFlag: false }))
  brief = { id: briefVersionId, ...scope, orderRef, documentId: uuid(40), templateId: 'WZR-BRIEF', versionNo: 1, status: 'approved', simulationFlag: false, approvalRecords: [acceptance], inputVersions: pins.filter((_pin, index) => index !== 2) }
  briefDocument = { id: uuid(40), ...scope, orderRef, templateId: 'WZR-BRIEF', currentVersionId: briefVersionId, status: 'approved', deletedAt: null }
  documents.push(briefDocument)
  versions.push(brief)
  qa = { id: uuid(50), ...scope, orderRef, stepId: '3.7', status: 'done', qaResult: { verdict: 'ready' }, inputVersions: pins }
  freeze = { id: uuid(51), ...scope, orderRef, stepId: '3.8', status: 'done', inputVersions: pins, summary: { frozen: true, set_hash: 'exact-set-hash', qa_task_run_id: qa.id } }
  runs = [freeze, qa]
  findOne.mockImplementation((_em: unknown, entity: unknown, where: Row) => {
    const rows = entity === AgencyResearchDocument ? documents : entity === AgencyResearchDocumentVersion ? versions : entity === AgencyResearchTaskRun ? runs : []
    return rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null
  })
})

it('returns the exact accepted version, persisted freeze/QA and trusted process reference without generating strategy', async () => {
  const result = await resolveStrategyReadiness(em, scope, input)
  expect(result).toEqual({
    status: 'ready', orderRef,
    brief: { documentId: uuid(40), versionId: briefVersionId, documentRef: documentIdFor('WZR-BRIEF', orderRef), version: '1.0', templateId: 'WZR-BRIEF' },
    acceptance, process,
    analysis: { freezeTaskRunId: uuid(51), qaTaskRunId: uuid(50), setHash: 'exact-set-hash', documents: templates.map((templateId, index) => ({ documentId: uuid(20 + index), versionId: uuid(30 + index), documentRef: documentIdFor(templateId, orderRef), version: '1.0', templateId })) },
  })
  for (const call of findOne.mock.calls) {
    expect(call[2]).toMatchObject({ ...scope, orderRef })
    expect(call[4]).toEqual(scope)
  }
})

it('reports missing STD-PROCES identity instead of inventing a default', async () => {
  await expect(resolveStrategyReadiness(em, scope, { ...input, process: undefined })).resolves.toEqual({ status: 'not_ready', orderRef, reason: 'missing_process_configuration' })
  expect(findOne).not.toHaveBeenCalled()
})

it('does not resolve a foreign tenant version by UUID', async () => {
  brief.tenantId = uuid(99)
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'brief_not_found' })
})

it('does not use an old accepted brief after the current pointer changes', async () => {
  briefDocument.currentVersionId = uuid(98)
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'brief_not_current' })
})

it.each(['needs_review', 'ready_for_review', 'simulated_accepted'])('rejects brief state %s despite a historical receipt', async (status) => {
  briefDocument.status = status
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'brief_not_approved' })
})

it('requires the actual saved G acceptance, not a generic legacy approval or another submission', async () => {
  brief.approvalRecords = [{ person: uuid(7), at: acceptance.at, scope: 'brief', version: '1.0' }]
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'acceptance_not_found' })
  brief.approvalRecords = [acceptance]
  await expect(resolveStrategyReadiness(em, scope, { ...input, acceptanceSubmissionId: uuid(97) })).resolves.toMatchObject({ reason: 'acceptance_not_found' })
})

it('requires a stored completed frozen package and never reconstructs one from latest documents', async () => {
  runs = [qa]
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'frozen_analysis_not_found' })
  runs = [{ ...freeze, status: 'failed' }, freeze, qa]
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'frozen_analysis_invalid' })
})

it('requires the precise positive QA referenced by the frozen package', async () => {
  qa.qaResult = { verdict: 'to_fix' }
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'analysis_qa_not_ready' })
  qa.qaResult = { verdict: 'ready' }
  qa.inputVersions = pins.map((pin, index) => index === 0 ? { ...pin, version: '2.0' } : pin)
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'analysis_qa_versions_mismatch', templateId: 'WZR-ZRODLA' })
})

it('does not replace a superseded pinned analysis version with its current successor', async () => {
  documents[0].currentVersionId = uuid(96)
  versions.push({ ...versions[0], id: uuid(96), versionNo: 2 })
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'analysis_not_current', templateId: 'WZR-ZRODLA' })
})

it('rejects blocked dependencies and incomplete frozen sets', async () => {
  documents[1].status = 'needs_review'
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'analysis_requires_review', templateId: 'WZR-AUDYT' })
  documents[1].status = 'ready_for_review'
  freeze.inputVersions = pins.filter((_pin, index) => index !== 2)
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'frozen_analysis_invalid', templateId: 'WZR-KONKURENCJA' })
})

it('does not pair an accepted brief with a different analysis basis', async () => {
  brief.inputVersions = pins.map((pin, index) => index === 0 ? { ...pin, version: '2.0' } : pin)
  await expect(resolveStrategyReadiness(em, scope, input)).resolves.toMatchObject({ reason: 'brief_dependencies_mismatch', templateId: 'WZR-ZRODLA' })
})
