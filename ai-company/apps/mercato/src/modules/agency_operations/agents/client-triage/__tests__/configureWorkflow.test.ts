/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { configureNativeClientTriage } from '../configureWorkflow'
import { nativeClientSubmissionDefinition, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../workflow'

jest.mock('@open-mercato/core/modules/workflows/lib/definition-grant', () => ({
  authorizeWorkflowGrantChange: jest.fn(),
}))

const authorizeGrant = jest.mocked(authorizeWorkflowGrantChange)
const input = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000003',
}
const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const definition = {
  id: '00000000-0000-4000-8000-000000000004',
  workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
  version: 1,
}
const em = {}
const rbac = { userHasAllFeatures: jest.fn() }
const findOwnedDefinition = jest.fn()
const upsertOwnedDefinition = jest.fn()
const hasRegistration = jest.fn()
const container = {
  hasRegistration,
  resolve(key: string) {
    if (key === 'em') return em
    if (key === 'rbacService') return rbac
    if (key === 'workflowDefinitionAuthoring') return { findOwnedDefinition, upsertOwnedDefinition }
    throw new Error(key)
  },
} as unknown as AppContainer

beforeEach(() => {
  jest.clearAllMocks()
  authorizeGrant.mockResolvedValue(null)
  hasRegistration.mockReturnValue(true)
  findOwnedDefinition.mockResolvedValue(null)
  upsertOwnedDefinition.mockResolvedValue({ ok: true, definition })
})

it('uses native staff grant authorization before reading or writing a definition', async () => {
  authorizeGrant.mockResolvedValue({
    status: 403,
    body: { error: 'Insufficient permissions', code: 'WORKFLOW_GRANT_FEATURE_REQUIRED' },
  })
  await expect(configureNativeClientTriage(container, input)).rejects.toMatchObject({ status: 403 })
  expect(authorizeGrant).toHaveBeenCalledWith(rbac, {
    userId: input.userId, scope, current: [], requested: ['agent_orchestrator.agents.run'],
  })
  expect(findOwnedDefinition).not.toHaveBeenCalled()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('requires the native agent bridge before configuring execution', async () => {
  hasRegistration.mockReturnValue(false)
  await expect(configureNativeClientTriage(container, input)).rejects.toThrow('Native triage requires agent_orchestrator')
  expect(hasRegistration).toHaveBeenCalledWith('agentWorkflowBridge')
  expect(findOwnedDefinition).not.toHaveBeenCalled()
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('creates the owned native definition with its exact scope, granting staff actor, and agent execution grant', async () => {
  await expect(configureNativeClientTriage(container, input)).resolves.toEqual({
    workflowDefinitionId: definition.id, workflowId: definition.workflowId, version: definition.version,
  })
  expect(findOwnedDefinition).toHaveBeenCalledWith(em, { workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID, ...scope })
  expect(upsertOwnedDefinition).toHaveBeenCalledTimes(1)
  expect(upsertOwnedDefinition).toHaveBeenCalledWith(em, expect.objectContaining({
    ownerModule: 'agency_operations', ownerId: 'client_triage',
    workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
    definition: nativeClientSubmissionDefinition,
    grantedFeatures: ['agent_orchestrator.agents.run'],
    ...scope, actorUserId: input.userId,
  }))
})

it('refuses to overwrite an existing version and requires native publishing', async () => {
  findOwnedDefinition.mockResolvedValue(definition)
  await expect(configureNativeClientTriage(container, input)).rejects.toThrow('use native workflow version publishing')
  expect(upsertOwnedDefinition).not.toHaveBeenCalled()
})

it('does not report successful configuration when native authoring rejects foreign ownership', async () => {
  upsertOwnedDefinition.mockResolvedValue({ ok: false, reason: 'owned_by_other', definition })
  await expect(configureNativeClientTriage(container, input)).rejects.toThrow('Native triage definition is owned by another author')
})
