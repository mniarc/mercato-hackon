import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, postInstructionExecutionResultSchema, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { POST_INSTRUCTION_RESULT_KEY } from '../planApproval/contracts'
import { POST_EXECUTION_STEP_ID, type NativePostExecutionResult } from './contracts'

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

export function createPostExecutionActivity(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<NativePostExecutionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Post execution submission is outside the native workflow')
    const source = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    const saved = z.object({ result: postInstructionExecutionResultSchema }).safeParse(source?.context?.[POST_INSTRUCTION_RESULT_KEY])
    if (!saved.success) return { status: 'not_ready', orderRef: submission.caseId, reason: 'missing_post_instruction' }
    const instruction = saved.data.result
    if (instruction.orderRef !== submission.caseId) throw new Error('[internal] Post instruction belongs to another case')
    if (instruction.status === 'not_ready') return instruction
    const decision = z.object({ result: clientSubmissionDispositionSchema }).parse(source?.context?.clientTriageResult).result
    if (!decision.effectsApplied || decision.kind !== 'approve' || decision.acceptance.status !== 'plan_accepted') {
      throw new Error('[internal] Post execution requires the persisted plan approval and topic selection')
    }
    const receipt = decision.acceptance
    const accepted = receipt.record
    if (decision.targets.caseId !== submission.caseId || decision.targets.submissionId !== submission.id
      || receipt.orderRef !== submission.caseId || accepted.person !== submission.submittedByCustomerUserId
      || accepted.source.submissionId !== submission.id || accepted.source.eventId !== submission.eventId
      || accepted.source.workflowInstanceId !== context.workflowInstance.id
      || decision.targets.documentVersionReference !== accepted.documentVersionId
      || instruction.selectionSubmissionId !== submission.id || instruction.planVersionId !== accepted.documentVersionId
      || instruction.selectedTopicId !== accepted.selectedTopicId) {
      throw new Error('[internal] Post instruction does not belong to the original plan/topic selection')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Post execution case is outside the submission scope')
    const unconfigured = { status: 'not_configured' as const, orderRef: agencyCase.id, reason: 'missing_process_configuration' as const }
    if (!agencyCase.workflowInstanceId) return unconfigured
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null,
    }, undefined, scope)
    if (!analysis) return unconfigured
    const definition = await findOneWithDecryption(em, WorkflowDefinition, {
      ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null,
    }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return unconfigured
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    const authorization = activities.length === 1 ? authorizationSchema.safeParse(activities[0].config.args?.policy?.postExecution) : null
    if (!authorization?.success) return { status: 'not_configured', orderRef: agencyCase.id, reason: 'missing_post_authorization' }
    if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return { status: 'not_configured', orderRef: agencyCase.id, reason: 'execution_disabled' }
    const userId = await resolveWorkflowPrincipalUserId(em, source!)
    if (!userId) throw new Error('[internal] Post execution requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runPostExecution({
      context: { ...scope, userId, workflowInstanceId: source!.id, stepId: POST_EXECUTION_STEP_ID,
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}) },
      request: { orderRef: agencyCase.id, instructionVersionId: instruction.instructionVersionId,
        selectionSubmissionId: instruction.selectionSubmissionId,
        process: { workflowDefinitionId: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version },
        maxCostPln: authorization.data.maxCostPln },
    })
  }
}
