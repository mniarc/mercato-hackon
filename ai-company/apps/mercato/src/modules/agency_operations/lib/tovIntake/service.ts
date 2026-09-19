import { createHash, randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { AGENCY_TOV_RESEARCH_SERVICE, type AgencyTovResearchService, type SpecialistTovDocument } from '@/modules/agency_tov/lib/researchService'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase } from '../../data/entities'
import { AGENCY_CASE_ATTACHMENT_ENTITY_ID, AGENCY_CASE_ATTACHMENT_PARTITION_CODE } from '../contracts'
import { AGENCY_ANALYSIS_WORKER_ID } from '../analysisProcess'
import { AGENCY_ANALYSIS_WORKFLOW_ID } from '../analysisProcess/workflow'
import { PAID_CASE_ANALYSIS_CONTEXT, paidPurchaseOriginSchema } from '../paidCaseAnalysis/contracts'
import { AGENCY_TOV_RESULT_CONTEXT_KEY, AGENCY_TOV_WORKFLOW_ID, assertTovProcessConfigured, parseTovMaterial } from '../tovProcess'
import {
  STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID,
  STAFF_TOV_INTAKE_CONTEXT_KEY,
  staffTovIntakeContextSchema,
  staffTovIntakeInputSchema,
  staffTovIntakeStatusSchema,
  staffTovResearchResultSchema,
  type StaffTovIntakeService,
  type StaffTovIntakeStatus,
} from './contracts'

const WRITE_FEATURES = ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.manage']
const READ_FEATURES = ['agency_operations.cases.view', 'customers.companies.view', 'agency_tov.view']

type WorkflowExecutor = {
  startWorkflow: (em: EntityManager, options: {
    workflowId: string
    tenantId: string
    organizationId: string
    initialContext: Record<string, unknown>
    correlationKey: string
    metadata: { initiatedBy: string; entityType: string; entityId: string; labels?: Record<string, string> }
  }) => Promise<{ id: string; status?: string }>
  executeWorkflow: (em: EntityManager, container: AppContainer, id: string, context: { userId: string }) => Promise<unknown>
}

const workflowExecutionSchema = z.object({ status: z.string(), currentStep: z.string().nullable().optional() }).passthrough()

function conflict(): never {
  throw new CrudHttpError(409, { error: 'api.errors.conflict' })
}

function missing(): never {
  throw new CrudHttpError(404, { error: 'api.errors.notFound' })
}

function correlationKey(caseId: string): string {
  return `agency-tov-intake:${caseId}`
}

function readResult(instance: WorkflowInstance) {
  return z.object({ result: staffTovResearchResultSchema }).safeParse(instance.context?.[AGENCY_TOV_RESULT_CONTEXT_KEY])
}

function project(instance: WorkflowInstance, replayed: boolean): StaffTovIntakeStatus {
  const intake = staffTovIntakeContextSchema.parse(instance.context?.[STAFF_TOV_INTAKE_CONTEXT_KEY])
  const saved = readResult(instance)
  const terminalWithoutResult = ['COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED'].includes(instance.status)
  return staffTovIntakeStatusSchema.parse({
    intakeId: intake.intakeId,
    caseId: intake.caseId,
    customerEntityId: intake.customerEntityId,
    workflowInstanceId: instance.id,
    workflowStatus: instance.status,
    currentStep: instance.currentStepId ?? null,
    state: saved.success ? 'completed' : terminalWithoutResult || instance.status === 'PAUSED' ? 'attention_required'
      : instance.status === 'RUNNING' || instance.status === 'WAITING_FOR_ACTIVITIES' ? 'running' : 'accepted',
    replayed,
    result: saved.success ? saved.data.result : null,
  })
}

async function authorize(container: AppContainer, userId: string, scope: { tenantId: string; organizationId: string }, write: boolean) {
  const allowed = await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService')
    .userHasAllFeatures(userId, write ? WRITE_FEATURES : READ_FEATURES, scope)
  if (!allowed) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
}

async function paidCase(em: EntityManager, scope: { tenantId: string; organizationId: string }, caseId: string, lock = false) {
  const agencyCase = await findOneWithDecryption(em, AgencyCase, { id: caseId, ...scope, deletedAt: null },
    lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined, scope)
  if (!agencyCase) missing()
  if (agencyCase.agentWorkerId !== AGENCY_ANALYSIS_WORKER_ID || !agencyCase.workflowInstanceId) conflict()
  const analysis = await findOneWithDecryption(em, WorkflowInstance, {
    id: agencyCase.workflowInstanceId, workflowId: AGENCY_ANALYSIS_WORKFLOW_ID, ...scope, deletedAt: null,
  }, undefined, scope)
  const origin = paidPurchaseOriginSchema.safeParse(analysis?.context?.[PAID_CASE_ANALYSIS_CONTEXT])
  if (!analysis || analysis.context?.caseId !== agencyCase.id || analysis.context?.customerEntityId !== agencyCase.customerEntityId || !origin.success) conflict()
  return agencyCase
}

export function createStaffTovIntakeService(container: AppContainer): StaffTovIntakeService {
  const em = container.resolve<EntityManager>('em')
  const executor = container.resolve<WorkflowExecutor>('workflowExecutor')
  const attachments = container.resolve<AttachmentService>('attachmentService')

  return {
    async start(rawInput) {
      const input = staffTovIntakeInputSchema.parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      await authorize(container, input.userId, scope, true)
      await assertTovProcessConfigured(container, scope)
      await parseTovMaterial(input.file.buffer)
      const key = correlationKey(input.caseId)
      const existing = await findOneWithDecryption(em, WorkflowInstance, {
        ...scope, workflowId: AGENCY_TOV_WORKFLOW_ID, correlationKey: key, deletedAt: null,
      }, undefined, scope)
      if (existing) return project(existing, true)

      const intakeId = randomUUID()
      const corpusSha256 = createHash('sha256').update(input.file.buffer).digest('hex')
      let workflowInstanceId: string | null = null
      try {
        await attachments.createScoped({
          ...scope,
          entityId: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID,
          recordId: intakeId,
          partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
          fileName: input.file.fileName,
          declaredMimeType: input.file.mimeType,
          buffer: input.file.buffer,
          assignments: [{ type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: input.caseId }],
          persistLink: async (tx, attachmentId) => {
            const agencyCase = await paidCase(tx, scope, input.caseId, true)
            const replay = await findOneWithDecryption(tx, WorkflowInstance, {
              ...scope, workflowId: AGENCY_TOV_WORKFLOW_ID, correlationKey: key, deletedAt: null,
            }, undefined, scope)
            if (replay) throw new Error(`[tov-intake-replay]${replay.id}`)
            const staffTovIntake = staffTovIntakeContextSchema.parse({
              intakeId, caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId,
              corpusAttachmentId: attachmentId, corpusSha256, initiatedByUserId: input.userId, eventId: input.eventId,
            })
            const instance = await executor.startWorkflow(tx, {
              ...scope,
              workflowId: AGENCY_TOV_WORKFLOW_ID,
              correlationKey: key,
              metadata: {
                initiatedBy: input.userId,
                entityType: STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID,
                entityId: intakeId,
                labels: { caseId: agencyCase.id, customerEntityId: agencyCase.customerEntityId },
              },
              initialContext: {
                caseId: agencyCase.id,
                customerEntityId: agencyCase.customerEntityId,
                process: { kind: 'tone_of_voice', brand: input.brand, outputLanguage: input.outputLanguage },
                [STAFF_TOV_INTAKE_CONTEXT_KEY]: staffTovIntake,
              },
            })
            workflowInstanceId = instance.id
          },
        })
      } catch (error) {
        const replayId = error instanceof Error ? /^\[tov-intake-replay\](.+)$/.exec(error.message)?.[1] : undefined
        const replay = await findOneWithDecryption(em, WorkflowInstance, {
          ...scope, workflowId: AGENCY_TOV_WORKFLOW_ID,
          ...(replayId ? { id: replayId } : { correlationKey: key }), deletedAt: null,
        }, undefined, scope)
        if (!replay) throw error
        return project(replay, true)
      }
      if (!workflowInstanceId) conflict()
      workflowExecutionSchema.parse(await executor.executeWorkflow(em, container, workflowInstanceId, { userId: input.userId }))
      const instance = await findOneWithDecryption(em, WorkflowInstance, { ...scope, id: workflowInstanceId, workflowId: AGENCY_TOV_WORKFLOW_ID, deletedAt: null }, undefined, scope)
      if (!instance) missing()
      return project(instance, false)
    },

    async get(rawInput) {
      const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid(), workflowInstanceId: z.uuid() }).parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      await authorize(container, input.userId, scope, false)
      const instance = await findOneWithDecryption(em, WorkflowInstance, {
        ...scope, id: input.workflowInstanceId, workflowId: AGENCY_TOV_WORKFLOW_ID, deletedAt: null,
      }, undefined, scope)
      if (!instance || instance.metadata?.entityType !== STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID) missing()
      const intake = staffTovIntakeContextSchema.safeParse(instance.context?.[STAFF_TOV_INTAKE_CONTEXT_KEY])
      if (!intake.success) missing()
      await paidCase(em, scope, intake.data.caseId)
      return project(instance, true)
    },

    async resolveForCase(rawInput) {
      const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), caseId: z.uuid(), workflowInstanceId: z.uuid().optional() }).parse(rawInput)
      const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
      const instance = await findOneWithDecryption(em, WorkflowInstance, {
        ...scope, ...(input.workflowInstanceId ? { id: input.workflowInstanceId } : { correlationKey: correlationKey(input.caseId) }),
        workflowId: AGENCY_TOV_WORKFLOW_ID, deletedAt: null,
      }, undefined, scope)
      const intake = staffTovIntakeContextSchema.safeParse(instance?.context?.[STAFF_TOV_INTAKE_CONTEXT_KEY])
      if (!instance || instance.metadata?.entityType !== STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID
        || !intake.success || intake.data.caseId !== input.caseId) {
        return { status: 'missing', workflowInstanceId: input.workflowInstanceId ?? null }
      }
      const agencyCase = await paidCase(em, scope, input.caseId)
      if (agencyCase.customerEntityId !== intake.data.customerEntityId) return { status: 'missing', workflowInstanceId: instance.id }
      const saved = readResult(instance)
      if (!saved.success) return {
        status: ['COMPLETED', 'FAILED', 'CANCELLED', 'COMPENSATING', 'COMPENSATED', 'PAUSED'].includes(instance.status) ? 'attention_required' : 'running',
        workflowInstanceId: instance.id,
      }
      const research = container.resolve<AgencyTovResearchService>(AGENCY_TOV_RESEARCH_SERVICE)
      const documents = (await Promise.all(saved.data.result.documentVersionIds.map((versionId) => research.getDocumentVersion(scope, {
        researchRunId: saved.data.result.researchRunId, versionId,
      })))).filter((document): document is SpecialistTovDocument => document !== null)
      if (documents.length !== 1) return { status: 'attention_required', workflowInstanceId: instance.id }
      const document = documents[0]
      return { status: 'ready', workflowInstanceId: instance.id, reference: {
        owner: document.owner, kind: document.kind, researchRunId: document.researchRunId,
        documentId: document.documentId, versionId: document.versionId, version: document.version,
      } }
    },
  }
}
