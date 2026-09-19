import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { WorkflowDefinitionAuthoring } from '@open-mercato/core/modules/workflows/lib/owned-definition'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { AgencyCase } from '../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE, tovProcessRequestSchema } from './contracts'
import {
  STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID,
  STAFF_TOV_INTAKE_CONTEXT_KEY,
  staffTovIntakeContextSchema,
} from './tovIntake/contracts'

export const AGENCY_TOV_WORKFLOW_ID = 'agency_operations.tov-research.v1'
export const AGENCY_TOV_FUNCTION_NAME = 'agency_operations.researchToneOfVoice'
export const AGENCY_TOV_ACTIVITY_ID = 'research_tov'
export const AGENCY_TOV_WORKER_ID = 'agency_operations.agent-worker.tov.v1'
export const AGENCY_TOV_RESULT_CONTEXT_KEY = `${AGENCY_TOV_ACTIVITY_ID}_result`

export function assertTovExecutionEnabled(): void {
  if (!parseBooleanWithDefault(process.env.AGENCY_TOV_EXECUTION_ENABLED, false)) {
    throw new CrudHttpError(409, { error: 'Tone-of-voice execution is not enabled' })
  }
}

export async function parseTovMaterial(buffer: Buffer) {
  if (buffer.length > 1024 * 1024) {
    throw new CrudHttpError(400, { error: 'Tone-of-voice corpus must be at most 1 MiB' })
  }
  const { tovPostSchema } = await import('../../agency_tov/data/validators')
  let raw: unknown
  try {
    raw = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new CrudHttpError(400, { error: 'Tone-of-voice material must be normalized JSON posts' })
  }
  const parsed = z.array(tovPostSchema).min(1).max(100).safeParse(raw)
  if (!parsed.success) {
    throw new CrudHttpError(400, { error: 'Expected an array of 1–100 normalized tone-of-voice posts' })
  }
  return parsed.data
}

export async function assertTovProcessConfigured(container: AppContainer, scope: { tenantId: string; organizationId: string }): Promise<void> {
  assertTovExecutionEnabled()
  if (!container.hasRegistration('agencyTovResearchService')) {
    throw new CrudHttpError(409, { error: 'Tone-of-voice service is not available' })
  }
  const authoring = container.resolve<WorkflowDefinitionAuthoring>('workflowDefinitionAuthoring')
  const definition = await authoring.findOwnedDefinition(container.resolve<EntityManager>('em'), {
    workflowId: AGENCY_TOV_WORKFLOW_ID,
    ...scope,
  })
  if (!definition?.enabled || definition.metadata?.generatedBy?.module !== 'agency_operations' || !definition.grantedFeatures?.length) {
    throw new CrudHttpError(409, { error: 'Configure the agency tone-of-voice workflow before accepting live requests' })
  }
}

const activityContextSchema = z.object({
  userId: z.uuid(),
  stepInstanceId: z.uuid(),
  workflowInstance: z.object({
    id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(), status: z.string(),
    context: z.record(z.string(), z.unknown()),
  }).passthrough(),
}).passthrough()

const activityInputSchema = z.object({ caseId: z.uuid(), process: tovProcessRequestSchema })

export function createTovWorkflowActivity(container: AppContainer) {
  return async (rawInput: unknown, rawContext: unknown) => {
    assertTovExecutionEnabled()
    const input = activityInputSchema.parse(rawInput)
    const context = activityContextSchema.parse(rawContext)
    const completed = z.object({ result: z.object({ researchRunId: z.uuid(), documentVersionIds: z.array(z.uuid()), agentRunIds: z.array(z.uuid()) }) })
      .safeParse(context.workflowInstance.context[AGENCY_TOV_RESULT_CONTEXT_KEY])
    if (completed.success) return completed.data.result
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED'].includes(context.workflowInstance.status)) {
      throw new Error('[internal] Tone-of-voice activity cannot restart a terminal workflow')
    }
    const scope = { tenantId: context.workflowInstance.tenantId, organizationId: context.workflowInstance.organizationId }
    const staffIntake = staffTovIntakeContextSchema.safeParse(context.workflowInstance.context[STAFF_TOV_INTAKE_CONTEXT_KEY])
    const agencyCase = await findOneWithDecryption(container.resolve<EntityManager>('em'), AgencyCase, {
      id: input.caseId, ...scope,
      ...(staffIntake.success ? { customerEntityId: staffIntake.data.customerEntityId } : { workflowInstanceId: context.workflowInstance.id }),
      deletedAt: null,
    }, undefined, scope)
    if (!agencyCase) throw new Error('[internal] Agency case is outside the workflow scope')
    if (staffIntake.success && (staffIntake.data.caseId !== agencyCase.id || staffIntake.data.initiatedByUserId !== context.userId)) {
      throw new Error('[internal] Staff tone-of-voice intake is outside the workflow principal or case scope')
    }
    const material = await container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: staffIntake.success ? staffIntake.data.corpusAttachmentId : agencyCase.materialAttachmentId,
      auth: { sub: context.userId, tenantId: scope.tenantId, orgId: scope.organizationId },
      expectedOwner: staffIntake.success
        ? { entityId: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID, recordId: staffIntake.data.intakeId }
        : { entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID, recordId: agencyCase.id },
      expectedAssignment: { type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase.id },
      expectedPartitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
      requirePrivatePartition: true,
    })
    if (staffIntake.success && createHash('sha256').update(material.buffer).digest('hex') !== staffIntake.data.corpusSha256) {
      throw new Error('[internal] Staff tone-of-voice corpus no longer matches the pinned intake')
    }
    const posts = await parseTovMaterial(material.buffer)
    const service = container.resolve<{
      run: (input: {
        context: { tenantId: string; organizationId: string; userId: string; workflowInstanceId: string; stepId: string; invocationId: string }
        brand: string
        outputLanguage: 'en' | 'pl'
        posts: typeof posts
      }) => Promise<{ researchRunId: string; documentVersionIds: string[]; agentRunIds: string[] }>
    }>('agencyTovResearchService')
    const result = await service.run({
      context: { ...scope, userId: context.userId, workflowInstanceId: context.workflowInstance.id, stepId: 'tov_research', invocationId: context.stepInstanceId },
      brand: input.process.brand,
      outputLanguage: input.process.outputLanguage,
      posts,
    })
    return { researchRunId: result.researchRunId, documentVersionIds: result.documentVersionIds, agentRunIds: result.agentRunIds }
  }
}
