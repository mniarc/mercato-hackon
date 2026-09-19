import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../../lib/contracts/clientSubmission'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema, type ClientTriageAllowedTarget } from './contract'
import { projectClientTriageResult } from './projectResult'
import { createBriefApproval } from './briefApproval'
import { createStrategyPairApproval } from '../../lib/strategyPairApproval/service'
import { isClientTriageEnabled } from './configuration'
import { CLIENT_TRIAGE_INTERPRETATION_KEY, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from './workflow'

const activityContextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(),
  workflowId: z.literal(NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID),
  context: z.record(z.string(), z.unknown()),
}) })

export function createClientTriageActivities(container: AppContainer) {
  const briefApproval = createBriefApproval(container)
  const strategyPairApproval = createStrategyPairApproval(container)
  async function original(rawContext: unknown) {
    const { workflowInstance } = activityContextSchema.parse(rawContext)
    const { tenantId, organizationId } = workflowInstance
    const submission = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyClientSubmission, {
      workflowInstanceId: workflowInstance.id, tenantId, organizationId, deletedAt: null,
    }, undefined, { tenantId, organizationId })
    if (!submission) throw new Error('[internal] Client submission is outside the native workflow scope')
    return { submission, workflowInstance }
  }

  const activities = {
    async prepare(_input: unknown, context: unknown) {
      if (!isClientTriageEnabled()) throw new Error('[internal] Native client triage is disabled')
      const { submission } = await original(context)
      return inputSchema.parse({ original: submission.original })
    },
    async project(_input: unknown, context: unknown) {
      const { submission, workflowInstance } = await original(context)
      const interpretation = workflowInstance.context[CLIENT_TRIAGE_INTERPRETATION_KEY]
      const allowedTargets: ClientTriageAllowedTarget[] = ['answered', 'client_reply']
      const approval = await briefApproval.load(submission, interpretation)
      if (approval) allowedTargets.push('brief_accepted')
      const pairApproval = await strategyPairApproval.load(submission, interpretation)
      if (pairApproval) allowedTargets.push('strategy_pair_decision')
      const result = projectClientTriageResult({
        tenantId: submission.tenantId, organizationId: submission.organizationId,
        customerEntityId: submission.customerEntityId, caseId: submission.caseId,
        submissionId: submission.id, workflowInstanceId: workflowInstance.id,
      }, interpretation, allowedTargets)
      if (!result.disposition) return { kind: 'unapplied' as const, triage: result }
      const disposition = clientSubmissionDispositionSchema.parse({
        kind: result.disposition.kind, source: 'native_agent', workerId: CLIENT_TRIAGE_AGENT_ID,
        rationale: result.interpretation.rationale, message: result.interpretation.responseMessage ?? '',
        targets: { caseId: submission.caseId, submissionId: submission.id,
          ...(result.disposition.kind === 'approve' ? { documentVersionReference: approval?.versionId ?? pairApproval?.pair.strategy.versionId } : {}) }, effectsApplied: false,
      })
      return { ...disposition, triage: result }
    },
    async acceptStrategyPair(_input: unknown, context: unknown) {
      const { submission, workflowInstance } = await original(context)
      const interpretation = workflowInstance.context[CLIENT_TRIAGE_INTERPRETATION_KEY]
      const acceptance = await strategyPairApproval.accept(submission, interpretation)
      const triage = projectClientTriageResult({ tenantId: submission.tenantId, organizationId: submission.organizationId,
        customerEntityId: submission.customerEntityId, caseId: submission.caseId, submissionId: submission.id,
        workflowInstanceId: workflowInstance.id }, interpretation, ['strategy_pair_decision'])
      return { kind: 'approve' as const, source: 'native_agent' as const, workerId: CLIENT_TRIAGE_AGENT_ID,
        rationale: triage.interpretation.rationale, message: triage.interpretation.responseMessage ?? '',
        targets: { caseId: submission.caseId, submissionId: submission.id, documentVersionReference: acceptance.pair.strategy.versionId },
        effectsApplied: true as const, acceptance, triage }
    },
    async acceptBrief(_input: unknown, context: unknown) {
      const { submission, workflowInstance } = await original(context)
      const interpretation = workflowInstance.context[CLIENT_TRIAGE_INTERPRETATION_KEY]
      const acceptance = await briefApproval.accept(submission, interpretation)
      const triage = projectClientTriageResult({ tenantId: submission.tenantId, organizationId: submission.organizationId,
        customerEntityId: submission.customerEntityId, caseId: submission.caseId, submissionId: submission.id,
        workflowInstanceId: workflowInstance.id }, interpretation, ['brief_accepted'])
      return { kind: 'approve' as const, source: 'native_agent' as const, workerId: CLIENT_TRIAGE_AGENT_ID,
        rationale: triage.interpretation.rationale, message: triage.interpretation.responseMessage ?? '',
        targets: { caseId: submission.caseId, submissionId: submission.id, documentVersionReference: acceptance.versionId },
        effectsApplied: true as const, acceptance, triage }
    },
  }
  return activities
}
