import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyClientSubmission } from '../../data/entities'
import { clientSubmissionDispositionSchema } from '../../lib/contracts/clientSubmission'
import { CLIENT_TRIAGE_AGENT_ID, inputSchema } from './contract'
import { projectClientTriageResult } from './projectResult'
import { isClientTriageEnabled } from './configuration'
import { CLIENT_TRIAGE_INTERPRETATION_KEY, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from './workflow'

const activityContextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(),
  workflowId: z.literal(NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID),
  context: z.record(z.string(), z.unknown()),
}) })

export function createClientTriageActivities(container: AppContainer) {
  async function original(rawContext: unknown) {
    const { workflowInstance } = activityContextSchema.parse(rawContext)
    const { tenantId, organizationId } = workflowInstance
    const submission = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyClientSubmission, {
      workflowInstanceId: workflowInstance.id, tenantId, organizationId, deletedAt: null,
    }, undefined, { tenantId, organizationId })
    if (!submission) throw new Error('[internal] Client submission is outside the native workflow scope')
    return { submission, workflowInstance }
  }

  return {
    async prepare(_input: unknown, context: unknown) {
      if (!isClientTriageEnabled()) throw new Error('[internal] Native client triage is disabled')
      const { submission } = await original(context)
      return inputSchema.parse({ original: submission.original })
    },
    async project(_input: unknown, context: unknown) {
      const { submission, workflowInstance } = await original(context)
      const result = projectClientTriageResult({
        tenantId: submission.tenantId, organizationId: submission.organizationId,
        customerEntityId: submission.customerEntityId, caseId: submission.caseId,
        submissionId: submission.id, workflowInstanceId: workflowInstance.id,
      }, workflowInstance.context[CLIENT_TRIAGE_INTERPRETATION_KEY], ['answered', 'client_reply'])
      if (!result.disposition) return { kind: 'unapplied' as const, triage: result }
      const disposition = clientSubmissionDispositionSchema.parse({
        kind: result.disposition.kind, source: 'native_agent', workerId: CLIENT_TRIAGE_AGENT_ID,
        rationale: result.interpretation.rationale, message: result.interpretation.responseMessage,
        targets: { caseId: submission.caseId, submissionId: submission.id }, effectsApplied: false,
      })
      return { ...disposition, triage: result }
    },
  }
}
