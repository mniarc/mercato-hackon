import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AgencyCase, AgencyClientSubmission } from '../../data/entities'
import { createMaterialRevisionBinding } from './binding'
import { MATERIAL_REVISION_RESULT_KEY, materialRevisionActivityResultSchema } from './contracts'

const contextSchema = z.object({ workflowInstance: z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), workflowId: z.literal('agency_operations.client-submission.native.v1'),
}) })

export async function readSavedMaterialRevision(container: AppContainer, rawContext: unknown) {
  const { workflowInstance } = contextSchema.parse(rawContext)
  const scope = { tenantId: workflowInstance.tenantId, organizationId: workflowInstance.organizationId }
  const em = container.resolve<EntityManager>('em')
  const submission = await findOneWithDecryption(em, AgencyClientSubmission, {
    ...scope, workflowInstanceId: workflowInstance.id, deletedAt: null,
  }, undefined, scope)
  const workflow = await findOneWithDecryption(em, WorkflowInstance, {
    ...scope, id: workflowInstance.id, workflowId: workflowInstance.workflowId, deletedAt: null,
  }, undefined, scope)
  if (!submission || !workflow) throw new Error('[internal] Material handoff is outside the native submission workflow')
  const result = z.object({ result: materialRevisionActivityResultSchema }).parse(workflow.context[MATERIAL_REVISION_RESULT_KEY]).result
  const bound = await createMaterialRevisionBinding(container).load(submission, workflow.context.nativeClientTriageInterpretation)
  if (!bound || result.orderRef !== submission.caseId
    || ('submissionId' in result && (result.submissionId !== submission.id || result.previousBriefVersionId !== bound.materialContext.brief?.versionId))) {
    throw new Error('[internal] Material handoff does not match the original source and brief version')
  }
  const agencyCase = await findOneWithDecryption(em, AgencyCase, {
    ...scope, id: submission.caseId, customerEntityId: submission.customerEntityId, deletedAt: null,
  }, undefined, scope)
  if (!agencyCase) throw new Error('[internal] Material handoff case is outside the original customer scope')
  return { em, scope, submission, workflow, agencyCase, result }
}
