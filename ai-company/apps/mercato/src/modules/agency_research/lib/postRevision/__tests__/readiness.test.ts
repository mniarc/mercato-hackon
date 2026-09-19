/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocumentVersion, AgencyResearchTaskRun } from '../../../data/entities'
import { readPostReview } from '../../postReview/read'
import { readPostExecutionInputs, type PostExecutionReady } from '../../postExecution/readiness'
import { readPostRevisionInputs } from '../readiness'
import type { PostRevisionRequest } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../postReview/read', () => ({ readPostReview: jest.fn() }))
jest.mock('../../postExecution/readiness', () => ({ readPostExecutionInputs: jest.fn() }))
jest.mock('../../../data/schemas/post', () => ({ postDataSchema: { safeParse: () => ({ success: true }) } }))

const em = {} as EntityManager
const scope = { tenantId: 'tenant', organizationId: 'organization' }
const request = { orderRef: 'case', postVersionId: 'post-version', maxCostPln: 2,
  process: { workflowDefinitionId: 'definition', workflowId: 'analysis', version: 1 } } as PostRevisionRequest
const ready = { status: 'ready', instruction: { document_id: 'WEW-ZLECENIE-POSTU@case', version: '2.0' }, tov: { document_id: 'KLI-TOV@case', version: '3.0' } } as PostExecutionReady
const post = { id: request.postVersionId, versionNo: 4, status: 'ready_for_review', data: { text: 'Pinned text' }, inputVersions: [ready.instruction, ready.tov] }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(readPostReview).mockResolvedValue({ orderRef: 'case', documentId: 'post', versionId: request.postVersionId, version: '4.0', templateId: 'WZR-POST',
    isCurrent: true, documentStatus: 'ready_for_review', versionStatus: 'ready_for_review', simulationFlag: false, clientViewMd: 'Review',
    qa: { state: 'assessed', taskRunId: 'editor', status: 'done', verdict: 'pass_for_draft' } })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    if (entity === AgencyResearchTaskRun) return { summary: { result: {
      status: 'ready', orderRef: 'case', planVersionId: 'plan', selectedTopicId: 'TOP02', selectionSubmissionId: 'original-selection',
      taskRunId: 'compiler', instructionDocumentId: 'instruction', instructionVersionId: 'instruction-version', instructionVersion: '2.0', replayed: false,
    } } } as never
    if ((query as { templateId?: string }).templateId === 'WZR-ZLECENIE-POSTU') return { id: 'instruction-version' } as never
    return post as never
  })
  jest.mocked(readPostExecutionInputs).mockResolvedValue(ready)
})

test('loads the exact scoped invited post and reuses accepted instruction/foundation readiness', async () => {
  const result = await readPostRevisionInputs(em, scope, request)
  expect(result).toMatchObject({ status: 'ready', previousPost: { versionId: request.postVersionId, version: '4.0', data: post.data } })
  expect(findOneWithDecryption).toHaveBeenCalledWith(em, AgencyResearchDocumentVersion, {
    ...scope, id: request.postVersionId, documentId: 'post', orderRef: 'case', templateId: 'WZR-POST',
  }, undefined, scope)
  expect(readPostExecutionInputs).toHaveBeenCalledWith(em, scope, {
    orderRef: 'case', instructionVersionId: 'instruction-version', selectionSubmissionId: 'original-selection',
    process: request.process, maxCostPln: 2,
  })
})

test('does not substitute newer instruction or voice inputs for the reviewed post pins', async () => {
  jest.mocked(readPostExecutionInputs).mockResolvedValue({ ...ready, tov: { ...ready.tov, version: '4.0' } })
  expect(await readPostRevisionInputs(em, scope, request)).toEqual({ status: 'not_ready', orderRef: 'case', reason: 'post_input_changed' })
  const review = await readPostReview(em, scope, request.orderRef, request.postVersionId)
  jest.mocked(readPostReview).mockResolvedValue({ ...review!, isCurrent: false })
  expect(await readPostRevisionInputs(em, scope, request)).toMatchObject({ status: 'not_ready', reason: 'post_not_current' })
})
