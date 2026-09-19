import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import { authorizeWorkflowGrantChange } from '@open-mercato/core/modules/workflows/lib/definition-grant'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { isClientTriageEnabled } from '../../agents/client-triage/configuration'
import { demoOffer } from '../orderBootstrap/demoOffer'
import { SALES_QUESTION_WORKFLOW_ID, SALES_ANSWER_WORKFLOW_ID } from './contracts'
import { salesQuestionWorkflow, createSalesAnswerWorkflow } from './workflow'

export function readSalesCatalogue() {
  return { versionId: demoOffer.offerVersion, productId: demoOffer.sku,
    content: [demoOffer.name, `${demoOffer.amount} ${demoOffer.currency}`, demoOffer.terms.en, demoOffer.terms.pl].join('\n\n') }
}

export async function ensureSalesQuestionReceipt(container: AppContainer, em: EntityManager, scope: { tenantId: string; organizationId: string }) {
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { ...scope, workflowId: SALES_QUESTION_WORKFLOW_ID })
  if (existing) {
    if (!existing.enabled || existing.metadata?.generatedBy?.module !== 'agency_operations' || existing.metadata.generatedBy.ownerId !== 'sales_question') {
      throw new CrudHttpError(409, { error: 'api.errors.conflict' })
    }
    return existing
  }
  const result = await authoring.upsertOwnedDefinition(em, {
    ...scope, workflowId: SALES_QUESTION_WORKFLOW_ID, ownerModule: 'agency_operations', ownerId: 'sales_question',
    workflowName: 'Saved pre-purchase question', definition: salesQuestionWorkflow, grantedFeatures: [],
  })
  if (!result.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return result.definition
}

export async function configureSalesQuestions(container: AppContainer, rawInput: unknown) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), allowExecution: z.literal(true) }).strict().parse(rawInput)
  const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
  const grantedFeatures = ['agent_orchestrator.agents.run']
  const failure = await authorizeWorkflowGrantChange(container.resolve('rbacService'), { userId: input.userId, scope, requested: grantedFeatures, current: [] })
  if (failure) throw new CrudHttpError(failure.status, failure.body)
  if (!isClientTriageEnabled() || !container.hasRegistration('agentWorkflowBridge')) throw new CrudHttpError(409, { error: 'agency.salesQuestions.state.waiting_configuration' })
  const em = container.resolve<EntityManager>('em')
  await ensureSalesQuestionReceipt(container, em, scope)
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const existing = await authoring.findOwnedDefinition(em, { ...scope, workflowId: SALES_ANSWER_WORKFLOW_ID })
  if (existing) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  const result = await authoring.upsertOwnedDefinition(em, {
    ...scope, workflowId: SALES_ANSWER_WORKFLOW_ID, ownerModule: 'agency_operations', ownerId: 'sales_answer',
    workflowName: 'G to fixed-offer sales advisor', definition: createSalesAnswerWorkflow(readSalesCatalogue()), actorUserId: input.userId, grantedFeatures,
  })
  if (!result.ok) throw new CrudHttpError(409, { error: 'api.errors.conflict' })
  return { workflowDefinitionId: result.definition.id, workflowId: result.definition.workflowId, version: result.definition.version }
}
