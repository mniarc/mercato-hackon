import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { AgencyCase } from '../data/entities'
import { createAgencyCaseSchema } from '../data/validators'
import { tovProcessRequestSchema } from './contracts'
import { AGENCY_TOV_WORKER_ID, AGENCY_TOV_WORKFLOW_ID, assertTovProcessConfigured } from './tovProcess'
import {
  AGENCY_AGENT_FUNCTION_NAME,
  AGENCY_AGENT_RESULT_CONTEXT_KEY,
  AGENCY_AGENT_WORKER_ID,
  AGENCY_CASE_WORKFLOW_ID,
} from '../workflows'

export const AGENCY_CASE_WORKFLOW_SERVICE = 'agencyCaseWorkflowService' as const

export const processAgencyCaseInputSchema = z.object({
  caseId: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  customerEntityId: z.uuid(),
  process: tovProcessRequestSchema.optional(),
})

export type ProcessAgencyCaseInput = z.infer<typeof processAgencyCaseInputSchema>

export const agencyCaseMaterialSchema = z.object({
  materialFileName: z.string().trim().min(1).max(255),
  materialMimeType: z.string().trim().min(1).max(255),
  materialFileSize: z.number().int().nonnegative(),
})

export const deterministicAgentWorkerInputSchema = z.object({
  caseId: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  customerEntityId: z.uuid(),
  submittedByCustomerUserId: z.uuid(),
  title: createAgencyCaseSchema.shape.title,
  agentWorkerId: z.literal(AGENCY_AGENT_WORKER_ID),
  materialFileName: agencyCaseMaterialSchema.shape.materialFileName,
  materialMimeType: agencyCaseMaterialSchema.shape.materialMimeType,
  materialFileSize: agencyCaseMaterialSchema.shape.materialFileSize,
})

export const deterministicAgentWorkerOutputSchema = z.object({
  kind: z.literal('no_op'),
  unchanged: z.literal(true),
  input: deterministicAgentWorkerInputSchema,
})

export type DeterministicAgentWorkerOutput = z.infer<typeof deterministicAgentWorkerOutputSchema>

const workflowActivityContextSchema = z.object({
  workflowInstance: z.object({
    tenantId: z.uuid(),
    organizationId: z.uuid(),
  }).passthrough(),
}).passthrough()

const completedExecutionSchema = z.object({
  status: z.literal('COMPLETED'),
  currentStep: z.literal('end'),
  context: z.object({
    [AGENCY_AGENT_RESULT_CONTEXT_KEY]: z.object({
      executed: z.literal(true),
      functionName: z.literal(AGENCY_AGENT_FUNCTION_NAME),
      result: deterministicAgentWorkerOutputSchema,
    }).passthrough(),
  }).passthrough(),
}).passthrough()

type WorkflowExecutor = {
  startWorkflow: (
    em: EntityManager,
    options: {
      workflowId: string
      initialContext: Record<string, unknown>
      correlationKey: string
      metadata: {
        entityType: string
        entityId: string
        labels: Record<string, string>
      }
      tenantId: string
      organizationId: string
    },
  ) => Promise<{ id: string }>
  executeWorkflow: (
    em: EntityManager,
    container: AppContainer,
    instanceId: string,
  ) => Promise<unknown>
}

export type AgencyCaseWorkflowResult = {
  caseId: string
  workflowInstanceId: string
  status: 'COMPLETED' | 'RUNNING' | 'WAITING_FOR_ACTIVITIES' | 'PAUSED' | 'FAILED' | 'CANCELLED'
  currentStep: string
  agentOutput?: DeterministicAgentWorkerOutput
}

export type AgencyCaseWorkflowService = {
  processCase: (input: ProcessAgencyCaseInput) => Promise<AgencyCaseWorkflowResult>
}

export function deterministicAgentWorker(
  rawInput: unknown,
  rawContext: unknown,
): DeterministicAgentWorkerOutput {
  const input = deterministicAgentWorkerInputSchema.parse(rawInput)
  const context = workflowActivityContextSchema.parse(rawContext)

  if (
    input.tenantId !== context.workflowInstance.tenantId
    || input.organizationId !== context.workflowInstance.organizationId
  ) {
    throw new Error('[internal] Agent worker input is outside the workflow scope')
  }

  return deterministicAgentWorkerOutputSchema.parse({
    kind: 'no_op',
    unchanged: true,
    input,
  })
}

async function loadCase(
  em: EntityManager,
  input: ProcessAgencyCaseInput,
): Promise<AgencyCase> {
  const agencyCase = await findOneWithDecryption(
    em,
    AgencyCase,
    {
      id: input.caseId,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      customerEntityId: input.customerEntityId,
      deletedAt: null,
    },
    undefined,
    { tenantId: input.tenantId, organizationId: input.organizationId },
  )

  if (!agencyCase) {
    throw new Error('[internal] Scoped agency case not found')
  }

  return agencyCase
}

function readMaterial(agencyCase: AgencyCase): z.infer<typeof agencyCaseMaterialSchema> {
  return agencyCaseMaterialSchema.parse({
    materialFileName: agencyCase.materialFileName,
    materialMimeType: agencyCase.materialMimeType,
    materialFileSize: agencyCase.materialFileSize,
  })
}

export function createAgencyCaseWorkflowService(
  container: AppContainer,
): AgencyCaseWorkflowService {
  const em = container.resolve<EntityManager>('em')
  const workflowExecutor = container.resolve<WorkflowExecutor>('workflowExecutor')

  async function executeCase(agencyCase: AgencyCase, input: ProcessAgencyCaseInput): Promise<AgencyCaseWorkflowResult> {
    const material = readMaterial(agencyCase)
    const isTov = agencyCase.agentWorkerId === AGENCY_TOV_WORKER_ID
    if (isTov) await assertTovProcessConfigured(container, input)
    if (isTov && !agencyCase.workflowInstanceId && !input.process) {
      throw new Error('[internal] Tone-of-voice process input is required')
    }

    let workflowInstanceId = agencyCase.workflowInstanceId
    if (!workflowInstanceId) {
      const workflowInstance = await workflowExecutor.startWorkflow(em, {
        workflowId: isTov ? AGENCY_TOV_WORKFLOW_ID : AGENCY_CASE_WORKFLOW_ID,
        initialContext: {
          caseId: agencyCase.id,
          tenantId: agencyCase.tenantId,
          organizationId: agencyCase.organizationId,
          customerEntityId: agencyCase.customerEntityId,
          submittedByCustomerUserId: agencyCase.submittedByCustomerUserId,
          title: agencyCase.title,
          agentWorkerId: agencyCase.agentWorkerId,
          ...material,
          ...(isTov ? { process: input.process } : {}),
        },
        correlationKey: `agency-case:${agencyCase.id}`,
        metadata: {
          entityType: 'agency_operations:agency_case',
          entityId: agencyCase.id,
          labels: { agentWorkerId: agencyCase.agentWorkerId },
        },
        tenantId: agencyCase.tenantId,
        organizationId: agencyCase.organizationId,
      })
      workflowInstanceId = workflowInstance.id
      agencyCase.workflowInstanceId = workflowInstanceId
      agencyCase.updatedAt = new Date()
      await em.flush()
    }

    const rawExecution = await workflowExecutor.executeWorkflow(em, container, workflowInstanceId)
    if (isTov) {
      const execution = z.object({
        status: z.enum(['COMPLETED', 'RUNNING', 'WAITING_FOR_ACTIVITIES', 'PAUSED', 'FAILED', 'CANCELLED']),
        currentStep: z.string(),
      }).parse(rawExecution)
      return { caseId: agencyCase.id, workflowInstanceId, ...execution }
    }
    const execution = completedExecutionSchema.parse(rawExecution)

    return {
      caseId: agencyCase.id,
      workflowInstanceId,
      status: execution.status,
      currentStep: execution.currentStep,
      agentOutput: execution.context[AGENCY_AGENT_RESULT_CONTEXT_KEY].result,
    }
  }

  return {
    async processCase(rawInput) {
      const input = processAgencyCaseInputSchema.parse(rawInput)
      return executeCase(await loadCase(em, input), input)
    },
  }
}
