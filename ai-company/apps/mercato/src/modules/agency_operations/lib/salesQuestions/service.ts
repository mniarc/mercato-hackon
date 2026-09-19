import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type * as WorkflowExecutor from '@open-mercato/core/modules/workflows/lib/workflow-executor'
import { ClientTriageConfigurationError, isClientTriageEnabled } from '../../agents/client-triage/configuration'
import { outputSchema as salesAnswerSchema } from '../../agents/sales-advisor/contract'
import { ensureSalesQuestionReceipt, readSalesCatalogue } from './configure'
import {
  SALES_ANSWER_WORKFLOW_ID, SALES_QUESTION_ENTITY, SALES_QUESTION_WORKFLOW_ID, savedSalesQuestionSchema,
  salesQuestionIdentitySchema, salesQuestionRequestSchema, type SalesQuestionIdentity, type SalesQuestionItem, type SalesQuestionsService,
} from './contracts'

export async function loadSavedSalesQuestion(em: EntityManager, scope: { tenantId: string; organizationId: string }, id: string, customerUserId?: string) {
  const row = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope, id, workflowId: SALES_QUESTION_WORKFLOW_ID, deletedAt: null,
  }, undefined, scope)
  if (!row || row.metadata?.entityType !== SALES_QUESTION_ENTITY) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
  const original = savedSalesQuestionSchema.parse(row.context?.salesQuestion)
  if (original.tenantId !== scope.tenantId || original.organizationId !== scope.organizationId
    || row.metadata.entityId !== original.customerUserId || (customerUserId && original.customerUserId !== customerUserId)) {
    throw new CrudHttpError(404, { error: 'api.errors.notFound' })
  }
  return { row, original }
}

export function createSalesQuestionsService(container: AppContainer): SalesQuestionsService {
  const em = container.resolve<EntityManager>('em')
  const executor = container.resolve<typeof WorkflowExecutor>('workflowExecutor')

  async function authorize(manager: EntityManager, rawIdentity: SalesQuestionIdentity, lock = false) {
    const identity = salesQuestionIdentitySchema.parse(rawIdentity)
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const user = await findOneWithDecryption(manager, CustomerUser, { ...scope, id: identity.customerUserId, deletedAt: null },
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined, scope)
    if (!user?.isActive || !user.emailVerifiedAt) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    return { identity, scope }
  }

  async function execution(manager: EntityManager, scope: { tenantId: string; organizationId: string }, questionId: string) {
    return findOneWithDecryption(manager, WorkflowInstance, {
      ...scope, workflowId: SALES_ANSWER_WORKFLOW_ID, correlationKey: `agency-sales-answer:${questionId}`, deletedAt: null,
    }, undefined, scope)
  }

  async function project(identity: SalesQuestionIdentity, id: string): Promise<SalesQuestionItem> {
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const { row, original } = await loadSavedSalesQuestion(em, scope, id, identity.customerUserId)
    const child = await execution(em, scope, id)
    const answer = row.context?.salesQuestionAnswer ? salesAnswerSchema.parse(row.context.salesQuestionAnswer) : null
    return {
      id, eventId: original.eventId, question: original.question, createdAt: row.createdAt.toISOString(),
      previousQuestionId: original.previousQuestionId, catalogVersionId: original.catalog.versionId, productId: original.catalog.productId,
      state: answer ? 'answered' : !child ? 'waiting_configuration'
        : ['FAILED', 'CANCELLED', 'COMPLETED', 'PAUSED'].includes(child.status) ? 'attention_required' : 'processing', answer,
    }
  }

  async function dispatch(identity: SalesQuestionIdentity, questionId: string) {
    try { if (!isClientTriageEnabled()) return }
    catch (error) {
      if (error instanceof ClientTriageConfigurationError) return
      throw error
    }
    if (!container.hasRegistration('agentWorkflowBridge')) return
    const child = await em.transactional(async (tx) => {
      const { scope } = await authorize(tx, identity, true)
      const { original } = await loadSavedSalesQuestion(tx, scope, questionId, identity.customerUserId)
      const existing = await execution(tx, scope, questionId)
      if (existing) return existing
      const definition = await container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring').findOwnedDefinition(tx, { ...scope, workflowId: SALES_ANSWER_WORKFLOW_ID })
      if (!definition?.enabled || !definition.grantedFeatures?.length || definition.metadata?.generatedBy?.module !== 'agency_operations'
        || definition.metadata.generatedBy.ownerId !== 'sales_answer') return null
      const configured = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
        .find((activity) => activity.activityId === 'sales_question_input')?.config?.args?.catalog
      if (JSON.stringify(configured) !== JSON.stringify(original.catalog)) return null
      return executor.startWorkflow(tx, {
        ...scope, workflowId: SALES_ANSWER_WORKFLOW_ID, version: definition.version,
        correlationKey: `agency-sales-answer:${questionId}`, metadata: { entityType: SALES_QUESTION_ENTITY, entityId: questionId },
        initialContext: { salesQuestionId: questionId },
      })
    })
    if (child?.currentStepId === 'start' && child.status === 'RUNNING') await executor.executeWorkflow(em, container, child.id)
  }

  return {
    async list(identity) {
      const { scope } = await authorize(em, identity)
      const rows = await findWithDecryption(em, WorkflowInstance, {
        ...scope, workflowId: SALES_QUESTION_WORKFLOW_ID, deletedAt: null,
        metadata: { entityType: SALES_QUESTION_ENTITY, entityId: identity.customerUserId },
      }, { limit: 100, orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
      return { items: await Promise.all(rows.map((row) => project(identity, row.id))), offer: readSalesCatalogue() }
    },
    async submit(identity, rawInput) {
      const input = salesQuestionRequestSchema.parse(rawInput)
      const saved = await em.transactional(async (tx) => {
        const { scope } = await authorize(tx, identity, true)
        const existing = await findOneWithDecryption(tx, WorkflowInstance, {
          ...scope, workflowId: SALES_QUESTION_WORKFLOW_ID, correlationKey: `agency-sales-question:${identity.customerUserId}:${input.eventId}`, deletedAt: null,
        }, undefined, scope)
        if (existing) {
          await loadSavedSalesQuestion(tx, scope, existing.id, identity.customerUserId)
          return { row: existing, replayed: true }
        }
        if (input.previousQuestionId) await loadSavedSalesQuestion(tx, scope, input.previousQuestionId, identity.customerUserId)
        const definition = await ensureSalesQuestionReceipt(container, tx, scope)
        const row = await executor.startWorkflow(tx, {
          ...scope, workflowId: SALES_QUESTION_WORKFLOW_ID, version: definition.version,
          correlationKey: `agency-sales-question:${identity.customerUserId}:${input.eventId}`,
          metadata: { entityType: SALES_QUESTION_ENTITY, entityId: identity.customerUserId },
          initialContext: { salesQuestion: { ...identity, ...input, previousQuestionId: input.previousQuestionId ?? null, catalog: readSalesCatalogue() } },
        })
        return { row, replayed: false }
      })
      if (saved.row.currentStepId === 'start') await executor.executeWorkflow(em, container, saved.row.id)
      await dispatch(identity, saved.row.id)
      return { item: await project(identity, saved.row.id), replayed: saved.replayed }
    },
  }
}
