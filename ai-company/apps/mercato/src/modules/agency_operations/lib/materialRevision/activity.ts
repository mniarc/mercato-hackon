import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { WorkflowDefinition, WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { resolveWorkflowPrincipalUserId } from '@open-mercato/core/modules/workflows/lib/activity-executor'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { createMaterialRevisionBinding } from './binding'
import { MATERIAL_REVISION_STEP_ID, materialRevisionUnavailableSchema, type NativeMaterialRevisionResult } from './contracts'

const contextSchema = z.object({ stepInstanceId: z.uuid().optional(), workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })
const authorizationSchema = z.object({ maxCostPln: z.number().positive() }).strict()

export function createMaterialRevisionActivity(container: AppContainer) {
  const binding = createMaterialRevisionBinding(container)
  return async (_input: unknown, rawContext: unknown): Promise<NativeMaterialRevisionResult> => {
    const context = contextSchema.parse(rawContext)
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: context.workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: context.workflowInstance.id, workflowId: context.workflowInstance.workflowId, deletedAt: null,
    }, undefined, scope)
    if (!submission || !workflow) throw new Error('[internal] Material revision is outside the native submission workflow')
    const bound = await binding.load(submission, workflow.context.nativeClientTriageInterpretation)
    if (!bound) throw new Error('[internal] Material revision requires the exact original material and saved native directive')
    const saved = z.object({ result: clientSubmissionDispositionSchema }).parse(workflow.context.clientTriageResult).result
    if (saved.kind !== 'change' || saved.source !== 'native_agent' || saved.effectsApplied
      || saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id
      || saved.targets.documentVersionReference !== bound.materialContext.brief?.versionId) {
      throw new Error('[internal] Material revision does not match the saved G disposition')
    }
    if (bound.materialContext.state !== 'eligible' || !bound.materialContext.brief) {
      return { status: 'not_ready', orderRef: submission.caseId,
        reason: bound.materialContext.state === 'eligible' ? 'brief_not_reviewable' : bound.materialContext.state }
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Material revision case is outside the submission scope')
    const unavailable = (reason: z.infer<typeof materialRevisionUnavailableSchema>['reason']): NativeMaterialRevisionResult => ({
      status: 'not_configured', orderRef: agencyCase.id, reason,
    })
    if (!agencyCase.workflowInstanceId) return unavailable('missing_process_configuration')
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1', deletedAt: null,
    }, undefined, scope)
    if (!analysis) return unavailable('missing_process_configuration')
    const definition = await findOneWithDecryption(em, WorkflowDefinition, {
      ...scope, id: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version, deletedAt: null,
    }, undefined, scope)
    if (!definition || definition.metadata?.generatedBy?.module !== 'agency_operations' || definition.metadata.generatedBy.ownerId !== 'analysis') return unavailable('missing_process_configuration')
    const activities = definition.definition.transitions.flatMap((transition) => transition.activities ?? [])
      .filter((activity) => activity.activityType === 'EXECUTE_FUNCTION' && activity.config.functionName === 'agency_operations.runAnalysis')
    const authorization = activities.length === 1 ? authorizationSchema.safeParse(activities[0].config.args?.policy?.materialRevision) : null
    if (!authorization?.success) return unavailable('missing_material_revision_authorization')
    if (!parseBooleanWithDefault(process.env.AGENCY_ANALYSIS_EXECUTION_ENABLED, false)) return unavailable('execution_disabled')
    const userId = await resolveWorkflowPrincipalUserId(em, workflow)
    if (!userId) throw new Error('[internal] Material revision requires the native workflow execution principal')
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).runMaterialRevision({
      context: { ...scope, userId, workflowInstanceId: workflow.id, stepId: MATERIAL_REVISION_STEP_ID,
        ...(context.stepInstanceId ? { invocationId: context.stepInstanceId } : {}) },
      request: { orderRef: bound.orderRef, briefVersionId: bound.materialContext.brief.versionId,
        source: bound.source, material: bound.materialContext.material, directive: bound.directive, maxCostPln: authorization.data.maxCostPln },
    })
  }
}
