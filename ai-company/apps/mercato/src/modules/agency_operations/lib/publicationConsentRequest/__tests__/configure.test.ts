import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { ensurePublicationConsentDefinition } from '../configure'
import { publicationConsentResponseSchema } from '../contracts'
import { publicationConsentWorkflowDefinition } from '../workflow'

const scope = { tenantId: '10000000-0000-4000-8000-000000000001', organizationId: '10000000-0000-4000-8000-000000000002', userId: '10000000-0000-4000-8000-000000000003' }
const findOwnedDefinition = jest.fn(), upsertOwnedDefinition = jest.fn()
const container = { resolve: () => ({ findOwnedDefinition, upsertOwnedDefinition }) } as unknown as AppContainer
const em = {} as EntityManager
beforeEach(() => { jest.clearAllMocks(); findOwnedDefinition.mockResolvedValue(null); upsertOwnedDefinition.mockResolvedValue({ ok: true }) })

test('uses the existing native customer task with deterministic receipt and scoped research grant', async () => {
  await ensurePublicationConsentDefinition(container, em, scope)
  expect(upsertOwnedDefinition).toHaveBeenCalledWith(em, expect.objectContaining({
    tenantId: scope.tenantId, organizationId: scope.organizationId, actorUserId: scope.userId,
    grantedFeatures: ['agency_research.manage'], definition: publicationConsentWorkflowDefinition,
  }))
  expect(publicationConsentWorkflowDefinition.steps.find((step) => step.stepId === 'client_consent')).toMatchObject({
    stepType: 'USER_TASK', userTaskConfig: { assigneeKind: 'customer', formKey: 'agency.publication-consent' },
  })
  expect(publicationConsentWorkflowDefinition.steps.some((step) => step.stepType === 'INVOKE_AGENT')).toBe(false)
})

test('preserves existing owned definition and refuses a foreign or disabled definition', async () => {
  findOwnedDefinition.mockResolvedValue({ enabled: true, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'publication_consent' } } })
  await ensurePublicationConsentDefinition(container, em, scope)
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
  findOwnedDefinition.mockResolvedValue({ enabled: true, metadata: { generatedBy: { module: 'other', ownerId: 'publication_consent' } } })
  await expect(ensurePublicationConsentDefinition(container, em, scope)).rejects.toMatchObject({ status: 409 })
  findOwnedDefinition.mockResolvedValue({ enabled: false, metadata: { generatedBy: { module: 'agency_operations', ownerId: 'publication_consent' } } })
  await expect(ensurePublicationConsentDefinition(container, em, scope)).rejects.toMatchObject({ status: 409 })
})

test('accepts only explicit exact-target consent, not content reapproval or caller identity', () => {
  const input = { postVersionId: scope.tenantId, configVersionId: scope.organizationId, consent: true, externalEventId: 'customer-original' }
  expect(publicationConsentResponseSchema.safeParse(input).success).toBe(true)
  expect(publicationConsentResponseSchema.safeParse({ ...input, approveContent: true }).success).toBe(false)
  expect(publicationConsentResponseSchema.safeParse({ ...input, customerUserId: scope.userId }).success).toBe(false)
  expect(publicationConsentResponseSchema.safeParse({ ...input, consent: false }).success).toBe(false)
})
