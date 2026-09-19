/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { UserTask, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { decidePortalTaskAccess, resolvePortalTaskPrincipal } from '@open-mercato/core/modules/workflows/lib/portal-task-access'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AgencyCase } from '../../../data/entities'
import { createPublicationConsentRequestService } from '../service'
import { PUBLICATION_CONSENT_WORKFLOW_ID } from '../contracts'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/portal-task-access', () => ({ resolvePortalTaskPrincipal: jest.fn(), decidePortalTaskAccess: jest.fn() }))
jest.mock('@open-mercato/core/modules/workflows/lib/activity-executor', () => ({ resolveWorkflowPrincipalUserId: jest.fn() }))
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [tenantId, organizationId, caseId, customerEntityId, userId, documentId, postVersionId, taskId, workflowId, configVersionId] = Array.from({ length: 10 }, (_, index) => uuid(index + 1))
const scope = { tenantId, organizationId }, auth = { sub: userId, tenantId, orgId: organizationId, customerEntityId } as never
const target = { configVersionId, platform: 'discord', accountId: null, channelId: '12345678901234567', displayName: 'Explicit demo destination' }
const snapshot = { caseId, customerEntityId, customerUserId: userId, documentId, postVersionId, version: '1.0',
  contentHash: 'saved-content-hash', clientViewMd: 'Immutable approved text', acceptedAt: '2026-09-19T10:00:00.000Z', target }
const response = { postVersionId, configVersionId, consent: true as const, externalEventId: 'consent-after-approval' }
const getPostAcceptance = jest.fn(), getPublicationConsent = jest.fn(), recordPublicationConsent = jest.fn(), preparePublication = jest.fn()
const completeUserTask = jest.fn(), startWorkflow = jest.fn(), executeWorkflow = jest.fn(), userHasAllFeatures = jest.fn()
const em = { transactional: async (fn: (tx: unknown) => unknown) => fn(em) }
const services: Record<string, unknown> = { em,
  agencyResearchService: { getPostAcceptance, getPublicationConsent, recordPublicationConsent, preparePublication },
  customerUserService: { findById: async () => ({ isActive: true, customerEntityId }) },
  customerRbacService: { loadAcl: async () => ({ isPortalAdmin: false }) }, rbacService: { userHasAllFeatures },
  taskHandler: { completeUserTask }, workflowExecutor: { startWorkflow, executeWorkflow },
  workflowDefinitionAuthoring: { findOwnedDefinition: async () => ({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'publication_consent' } } }) },
}
const container = { resolve: (key: string) => services[key] } as unknown as AppContainer
let task: UserTask, instance: WorkflowInstance, previousInvitation: boolean
beforeEach(() => {
  jest.clearAllMocks(); previousInvitation = false
  task = Object.assign(new UserTask(), { ...scope, id: taskId, workflowInstanceId: workflowId, assigneeKind: 'customer', assignedTo: userId, status: 'PENDING' })
  instance = Object.assign(new WorkflowInstance(), { ...scope, id: workflowId, workflowId: PUBLICATION_CONSENT_WORKFLOW_ID, status: 'PAUSED', currentStepId: 'client_consent', context: { publicationConsentInvitation: snapshot } })
  getPostAcceptance.mockResolvedValue({ status: 'ready', orderRef: caseId, post: { documentId, versionId: postVersionId, version: '1.0', isCurrent: true, documentStatus: 'approved', versionStatus: 'approved', clientViewMd: snapshot.clientViewMd },
    receipt: { person: userId, at: snapshot.acceptedAt, source: { submissionId: uuid(20) } } })
  getPublicationConsent.mockResolvedValue({ target, contentHash: snapshot.contentHash, state: 'missing', record: null })
  recordPublicationConsent.mockResolvedValue({ status: 'recorded', record: { at: '2026-09-19T11:00:00.000Z' }, replayed: false })
  preparePublication.mockResolvedValue({ status: 'not_ready', orderRef: caseId, reason: 'pinned_input_missing' })
  userHasAllFeatures.mockResolvedValue(true)
  jest.mocked(resolveWorkflowPrincipalUserId).mockResolvedValue(uuid(30))
  jest.mocked(resolvePortalTaskPrincipal).mockResolvedValue({ ok: true, principal: {} } as never)
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: true, actable: true } as never)
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, raw) => {
    const where = raw as Record<string, unknown>
    if (where.tenantId !== tenantId || where.organizationId !== organizationId) return null
    if (entity === AgencyCase) return where.id === caseId ? { id: caseId, customerEntityId, submittedByCustomerUserId: userId } as never : null
    if (entity === UserTask) return (!where.id || where.id === taskId) && (!where.status || where.status === task.status) ? task as never : null
    if (entity === WorkflowInstance) return where.correlationKey ? previousInvitation ? instance as never : null : instance as never
    return null
  })
  startWorkflow.mockResolvedValue(instance)
  completeUserTask.mockImplementation(async (_em, _container, input) => {
    task.status = 'COMPLETED'; task.completedBy = input.userId; task.completedAt = new Date('2026-09-19T11:00:00.000Z'); task.formData = input.formData
    instance.context.publicationConsentReceipt = { result: await createPublicationConsentRequestService(container).receiveResponse({ response: input.formData.publicationConsentResponse }, { workflowInstance: instance }) }
  })
})

test('staff explicitly invites already approved content with current target; replay does not reopen it', async () => {
  const service = createPublicationConsentRequestService(container)
  await expect(service.invite({ ...scope, userId: uuid(31), caseId, postVersionId })).resolves.toMatchObject({ taskId, replayed: false, canSend: false })
  expect(startWorkflow).toHaveBeenCalledWith(em, expect.objectContaining({ initialContext: { publicationConsentInvitation: snapshot } }))
  previousInvitation = true
  await expect(service.invite({ ...scope, userId: uuid(31), caseId, postVersionId })).resolves.toMatchObject({ replayed: true })
  expect(startWorkflow).toHaveBeenCalledTimes(1)
  expect(executeWorkflow).toHaveBeenCalledTimes(1)
  expect(recordPublicationConsent).not.toHaveBeenCalled()
})

test('native completion records original consent provenance independently and refreshes actual accepted content', async () => {
  const service = createPublicationConsentRequestService(container)
  await expect(service.respond(auth, taskId, response)).resolves.toMatchObject({ taskId, status: 'consent_recorded', canSend: false })
  expect(recordPublicationConsent).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({
    expectedContentHash: snapshot.contentHash, destination: target,
    source: { kind: 'native_publication_consent_task', invitationTaskId: taskId, workflowInstanceId: workflowId, eventId: response.externalEventId },
  }) }))
  expect(preparePublication).toHaveBeenCalledWith({ context: { ...scope, userId: uuid(30) }, request: { orderRef: caseId, postVersionId, acceptanceSubmissionId: uuid(20) } })
  recordPublicationConsent.mockResolvedValue({ status: 'recorded', record: { at: task.completedAt!.toISOString() }, replayed: true })
  await expect(service.respond(auth, taskId, response)).resolves.toMatchObject({ replayed: true })
  expect(completeUserTask).toHaveBeenCalledTimes(1)
  await expect(service.respond(auth, taskId, { ...response, externalEventId: 'changed-original' })).rejects.toMatchObject({ status: 409 })
})

test('changed destination or persisted content prevents response without changing the original snapshot', async () => {
  getPublicationConsent.mockResolvedValue({ target: { ...target, channelId: '98765432109876543' }, contentHash: snapshot.contentHash, state: 'missing', record: null })
  const service = createPublicationConsentRequestService(container)
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ request: { target }, canRespond: false })
  await expect(service.respond(auth, taskId, response)).rejects.toMatchObject({ status: 409 })
  getPublicationConsent.mockResolvedValue({ target, contentHash: 'different-bytes', state: 'missing', record: null })
  await expect(service.respond(auth, taskId, response)).rejects.toMatchObject({ status: 409 })
  expect(completeUserTask).not.toHaveBeenCalled()
})

test('staff authorization and native portal visibility remain independent required gates', async () => {
  const service = createPublicationConsentRequestService(container)
  userHasAllFeatures.mockResolvedValue(false)
  await expect(service.invite({ ...scope, userId: uuid(31), caseId, postVersionId })).rejects.toMatchObject({ status: 403 })
  jest.mocked(decidePortalTaskAccess).mockReturnValue({ visible: false, actable: false } as never)
  await expect(service.read(auth, taskId)).rejects.toMatchObject({ status: 404 })
  expect(startWorkflow).not.toHaveBeenCalled()
})

test('a retained receipt on content returned to review does not authorize a fresh invitation or consent', async () => {
  const current = await getPostAcceptance()
  getPostAcceptance.mockResolvedValue({ ...current, post: { ...current.post, documentStatus: 'ready_for_review' } })
  const service = createPublicationConsentRequestService(container)
  await expect(service.invite({ ...scope, userId: uuid(31), caseId, postVersionId })).rejects.toMatchObject({ status: 409 })
  await expect(service.read(auth, taskId)).resolves.toMatchObject({ canRespond: false })
  await expect(service.respond(auth, taskId, response)).rejects.toMatchObject({ status: 409 })
  expect(startWorkflow).not.toHaveBeenCalled()
  expect(recordPublicationConsent).not.toHaveBeenCalled()
})
