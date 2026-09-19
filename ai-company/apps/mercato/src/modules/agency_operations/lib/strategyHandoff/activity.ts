import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type StrategyReadiness } from '@/modules/agency_research/lib/contracts'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../contracts/clientSubmission'
import { CLIENT_TRIAGE_RESULT_KEY } from '../clientSubmissionWorkflow'

export { STRATEGY_READINESS_HANDOFF_FUNCTION, STRATEGY_READINESS_RESULT_KEY } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(),
  workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

/** Readiness only: never a strategy execution, budget authorization or paid call. */
export function createStrategyReadinessHandoff(container: AppContainer) {
  return async (_input: unknown, rawContext: unknown): Promise<StrategyReadiness> => {
    const { workflowInstance } = contextSchema.parse(rawContext)
    const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
    const em = container.resolve<EntityManager>('em')
    const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
      ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null,
    }, undefined, scope)
    if (!submission) throw new Error('[internal] Strategy handoff submission is outside the originating workflow')
    const sourceWorkflow = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId,
    }, undefined, scope)
    const saved = z.object({ result: clientSubmissionDispositionSchema })
      .parse(sourceWorkflow?.context?.[CLIENT_TRIAGE_RESULT_KEY]).result
    if (!saved.effectsApplied || saved.kind !== 'approve' || saved.acceptance.status !== 'accepted') {
      throw new Error('[internal] Strategy readiness requires a persisted brief acceptance')
    }
    const receipt = saved.acceptance
    if (saved.targets.caseId !== submission.caseId || saved.targets.submissionId !== submission.id
      || receipt.orderRef !== submission.caseId || receipt.source.submissionId !== submission.id
      || receipt.source.workflowInstanceId !== workflowInstance.id || receipt.source.eventId !== submission.eventId
      || receipt.customerUserId !== submission.submittedByCustomerUserId
      || saved.targets.documentVersionReference !== receipt.versionId) {
      throw new Error('[internal] Brief acceptance does not belong to the originating submission')
    }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Strategy handoff case is outside the submission scope')
    const notReady: StrategyReadiness = { status: 'not_ready', orderRef: agencyCase.id, reason: 'missing_process_configuration' }
    if (!agencyCase.workflowInstanceId) return notReady
    // The case's actual analysis execution is the process reference. The G workflow,
    // intake worker, portal payload and caller-supplied args are not STD-PROCES.
    const analysis = await findOneWithDecryption(em, WorkflowInstance, {
      ...scope, id: agencyCase.workflowInstanceId, workflowId: 'agency_operations.analysis.v1',
    }, undefined, scope)
    if (!analysis) return notReady
    return container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE).getStrategyReadiness(scope, {
      orderRef: agencyCase.id,
      briefVersionId: receipt.versionId,
      acceptanceSubmissionId: submission.id,
      process: { workflowDefinitionId: analysis.definitionId, workflowId: analysis.workflowId, version: analysis.version },
    })
  }
}
