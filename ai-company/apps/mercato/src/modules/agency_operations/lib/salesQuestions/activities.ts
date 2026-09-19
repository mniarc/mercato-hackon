import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { ActivityContext } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import type * as SignalHandler from '@open-mercato/core/modules/workflows/lib/signal-handler'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { clientTriageInterpretationSchema } from '../../agents/client-triage/contract'
import { inputSchema as salesInputSchema, outputSchema as salesAnswerSchema } from '../../agents/sales-advisor/contract'
import { SALES_ANSWER_WORKFLOW_ID, SALES_QUESTION_ENTITY, SALES_ANSWER_SIGNAL, salesCatalogueSchema, type SavedSalesQuestion } from './contracts'
import { loadSavedSalesQuestion } from './service'

export function validateSalesAnswer(original: SavedSalesQuestion, rawInterpretation: unknown, rawAnswer: unknown) {
  const interpretation = clientTriageInterpretationSchema.parse(rawInterpretation)
  const answer = salesAnswerSchema.parse(rawAnswer)
  if (answer.catalogVersionId !== original.catalog.versionId
    || answer.supportingCatalogPassages.some((passage) => !passage.trim() || !original.catalog.content.includes(passage))
    || (answer.disposition !== 'clarify' && answer.supportingCatalogPassages.length === 0)) {
    throw new Error('[internal] Sales answer is not grounded in the pinned catalogue')
  }
  if (['refuse_extension', 'change', 'approve', 'hold', 'escalate'].includes(interpretation.recommendedDisposition)
    && answer.disposition === 'answer') throw new Error('[internal] Pre-purchase request cannot authorize work or a catalogue extension')
  return answer
}

export function createSalesQuestionActivities(container: AppContainer) {
  const em = container.resolve<EntityManager>('em')

  async function load(context: ActivityContext) {
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: SALES_ANSWER_WORKFLOW_ID, deletedAt: null,
    }, undefined, scope)
    const questionId = z.uuid().parse(workflow?.context?.salesQuestionId)
    if (!workflow || workflow.metadata?.entityType !== SALES_QUESTION_ENTITY || workflow.metadata.entityId !== questionId
      || workflow.correlationKey !== `agency-sales-answer:${questionId}`) throw new Error('[internal] Sales question execution binding is invalid')
    return { ...await loadSavedSalesQuestion(em, scope, questionId), workflow, scope }
  }

  return {
    async prepareQuestion(rawArgs: unknown, context: ActivityContext) {
      const args = z.object({ catalog: salesCatalogueSchema }).parse(rawArgs)
      const { original } = await load(context)
      if (JSON.stringify(args.catalog) !== JSON.stringify(original.catalog)) throw new Error('[internal] Sales execution is not configured for this exact catalogue')
      const user = await container.resolve<{ findById(id: string, tenantId: string, organizationId: string): Promise<{ isActive: boolean; emailVerifiedAt?: Date | null } | null> }>('customerUserService')
        .findById(original.customerUserId, original.tenantId, original.organizationId)
      if (!user?.isActive || !user.emailVerifiedAt) throw new Error('[internal] Sales question account is inactive')
      return { original: { eventId: original.eventId, text: original.question } }
    },
    async prepareAnswer(_args: unknown, context: ActivityContext) {
      const { original, workflow, row, scope } = await load(context)
      const interpretation = clientTriageInterpretationSchema.parse(workflow.context?.salesQuestionInterpretation)
      const previous = original.previousQuestionId ? await loadSavedSalesQuestion(em, scope, original.previousQuestionId, original.customerUserId) : null
      const previousAnswer = previous?.row.context?.salesQuestionAnswer ? salesAnswerSchema.parse(previous.row.context.salesQuestionAnswer) : null
      return salesInputSchema.parse({
        submissionId: row.id, triageDecisionId: `${workflow.id}:triage`, question: original.question,
        catalog: original.catalog, triageRecommendation: interpretation.recommendedDisposition,
        ...(previous ? { previousExchange: { question: previous.original.question, answer: previousAnswer?.message ?? null } } : {}),
      })
    },
    async recordAnswer(_args: unknown, context: ActivityContext) {
      const { original, workflow, row, scope } = await load(context)
      const answer = validateSalesAnswer(original, workflow.context?.salesQuestionInterpretation, workflow.context?.salesAnswerProposal)
      if (row.context?.salesQuestionAnswer) {
        if (JSON.stringify(row.context.salesQuestionAnswer) !== JSON.stringify(answer)) throw new Error('[internal] Sales question already has a different saved answer')
        return { questionId: row.id, replayed: true }
      }
      await container.resolve<typeof SignalHandler>('signalHandler').sendSignal(em, container, {
        ...scope, instanceId: row.id, signalName: SALES_ANSWER_SIGNAL,
        payload: { salesQuestionAnswer: answer, salesAnswerWorkflowId: workflow.id },
      })
      return { questionId: row.id, replayed: false }
    },
  }
}
