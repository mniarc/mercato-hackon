/** @jest-environment node */
import { POST, metadata } from '../route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { restartAnalysisCase } from '../../../../../lib/analysisProcess/restart'
import { readCompletedSourceCorrection } from '../../../../../lib/sourceClarification/recovery'

jest.mock('@open-mercato/shared/lib/auth/server', () => ({ getAuthFromRequest: jest.fn() }))
jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('@open-mercato/shared/lib/crud/route-mutation-guard', () => ({ runRouteMutationGuards: jest.fn() }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../../../../lib/analysisProcess/restart', () => ({ restartAnalysisCase: jest.fn() }))
jest.mock('../../../../../lib/sourceClarification/recovery', () => ({ readCompletedSourceCorrection: jest.fn() }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const caseId = uuid(1), workflowInstanceId = uuid(2)
const auth = { sub: uuid(3), tenantId: uuid(4), orgId: uuid(5) }
const agencyCase = { id: caseId, workflowInstanceId }
const workflow = { id: workflowInstanceId, status: 'COMPLETED', currentStepId: 'source_response_saved' }
const after = jest.fn(), em = {}, container = { resolve: () => em }
const request = (body: unknown = { workflowInstanceId }) => new Request(`http://localhost/api/agency_operations/cases/${caseId}/resume-source-analysis`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getAuthFromRequest).mockResolvedValue(auth as never)
  jest.mocked(createRequestContainer).mockResolvedValue(container as never)
  jest.mocked(runRouteMutationGuards).mockResolvedValue({ ok: true, modifiedPayload: {}, runAfterSuccess: after } as never)
  jest.mocked(findOneWithDecryption).mockResolvedValueOnce(agencyCase as never).mockResolvedValueOnce(workflow as never)
  jest.mocked(readCompletedSourceCorrection).mockResolvedValue({ workflowInstanceId, taskId: uuid(6), submissionId: uuid(7), websiteUrl: 'https://example.org' })
  jest.mocked(restartAnalysisCase).mockResolvedValue({ caseId, previousWorkflowInstanceId: workflowInstanceId,
    workflowInstanceId: uuid(8), status: 'RUNNING', currentStep: 'analysis' })
})

test('resumes only the validated completed correction with server scope and a pinned expected workflow', async () => {
  const response = await POST(request(), { params: { id: caseId } })
  expect(response.status).toBe(200)
  expect(readCompletedSourceCorrection).toHaveBeenCalledWith(em, { tenantId: auth.tenantId, organizationId: auth.orgId }, agencyCase, workflow)
  expect(restartAnalysisCase).toHaveBeenCalledWith(container, { tenantId: auth.tenantId, organizationId: auth.orgId,
    userId: auth.sub, caseId, expectedWorkflowInstanceId: workflowInstanceId, resumeFrom: '3.2' })
  expect(findOneWithDecryption).toHaveBeenNthCalledWith(2, em, expect.anything(), expect.objectContaining({
    id: workflowInstanceId, tenantId: auth.tenantId, organizationId: auth.orgId, status: 'COMPLETED', currentStepId: 'source_response_saved',
  }), undefined, { tenantId: auth.tenantId, organizationId: auth.orgId })
  expect(metadata.POST.requireFeatures).toEqual(expect.arrayContaining(['agency_research.manage', 'workflows.manage']))
  expect(after).toHaveBeenCalledTimes(1)
})

test('rejects a stale workflow or missing correction instead of restarting an arbitrary terminal case', async () => {
  expect((await POST(request({ workflowInstanceId: uuid(9) }), { params: { id: caseId } })).status).toBe(409)
  expect(readCompletedSourceCorrection).not.toHaveBeenCalled()
  expect(restartAnalysisCase).not.toHaveBeenCalled()
})

test('does not resume without a validated customer receipt', async () => {
  jest.mocked(readCompletedSourceCorrection).mockResolvedValue(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(restartAnalysisCase).not.toHaveBeenCalled()
  expect(after).not.toHaveBeenCalled()
})

test('does not expose or resume a case outside the authenticated scope', async () => {
  jest.mocked(findOneWithDecryption).mockReset().mockResolvedValue(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(404)
  expect(readCompletedSourceCorrection).not.toHaveBeenCalled()
  expect(restartAnalysisCase).not.toHaveBeenCalled()
})

test('rejects caller scope and resume-point overrides and honors authentication and mutation guards', async () => {
  expect((await POST(request({ workflowInstanceId, tenantId: uuid(9), resumeFrom: '4.2' }), { params: { id: caseId } })).status).toBe(400)
  jest.mocked(getAuthFromRequest).mockResolvedValueOnce(null)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(401)
  jest.mocked(runRouteMutationGuards).mockResolvedValueOnce({ ok: false, response: Response.json({ error: 'blocked' }, { status: 409 }) } as never)
  expect((await POST(request(), { params: { id: caseId } })).status).toBe(409)
  expect(restartAnalysisCase).not.toHaveBeenCalled()
})
