import type { EntityManager } from '@mikro-orm/postgresql'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PUBLICATION_CONSENT_WORKFLOW_ID } from './contracts'
import { publicationConsentWorkflowDefinition } from './workflow'

export async function ensurePublicationConsentDefinition(container: AppContainer, em: EntityManager,
  input: { tenantId: string; organizationId: string; userId: string }) {
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const existing = await authoring.findOwnedDefinition(em, { ...scope, workflowId: PUBLICATION_CONSENT_WORKFLOW_ID })
  if (existing) {
    if (!existing.enabled || existing.metadata?.generatedBy?.module !== 'agency_operations'
      || existing.metadata.generatedBy.ownerId !== 'publication_consent') throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    return
  }
  const created = await authoring.upsertOwnedDefinition(em, { ...scope,
    ownerModule: 'agency_operations', ownerId: 'publication_consent', workflowId: PUBLICATION_CONSENT_WORKFLOW_ID,
    workflowName: 'Separate publication consent', definition: publicationConsentWorkflowDefinition,
    actorUserId: input.userId, grantedFeatures: ['agency_research.manage'],
  })
  if (!created.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
}
