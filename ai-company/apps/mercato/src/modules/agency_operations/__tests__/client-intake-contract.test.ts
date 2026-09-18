import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createContainer } from 'awilix'
import { AgencyCase } from '../data/entities'
import { register } from '../di'
import {
  createClientMaterialIntakeService,
} from '../lib/clientMaterialIntakeService'
import {
  AGENCY_CASE_ATTACHMENT_ENTITY_ID,
  AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
} from '../lib/contracts'
import type {
  ClientMaterialIntakeInput,
  ClientMaterialIntakeService,
} from '../lib/contracts'
import {
  CLIENT_MATERIAL_INTAKE_SERVICE,
  clientMaterialIntakeInputSchema,
} from '../lib/contracts'
import type { AgencyCaseWorkflowService } from '../lib/agencyCaseWorkflowService'
import { AGENCY_AGENT_WORKER_ID } from '../workflows'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222'
const CUSTOMER_ENTITY_ID = '33333333-3333-4333-8333-333333333333'
const CUSTOMER_USER_ID = '44444444-4444-4444-8444-444444444444'
const ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555'
const WORKFLOW_INSTANCE_ID = '66666666-6666-4666-8666-666666666666'
const FILE_BUFFER = Buffer.from('%PDF-1.7 client brief')

const intakeInput: ClientMaterialIntakeInput = {
  identity: {
    tenantId: TENANT_ID,
    organizationId: ORGANIZATION_ID,
    customerEntityId: CUSTOMER_ENTITY_ID,
    customerUserId: CUSTOMER_USER_ID,
  },
  title: 'Autumn campaign brief',
  file: {
    buffer: FILE_BUFFER,
    fileName: 'brief.pdf',
    mimeType: 'application/pdf',
  },
}

async function callAsPortalAdapter(service: ClientMaterialIntakeService) {
  return service.submitMaterial(intakeInput)
}

describe('client material intake contract', () => {
  it('is registered as a scoped service and rejects fields outside the narrow handoff', () => {
    const container = createContainer()
    register(container as unknown as AppContainer)

    expect(container.registrations[CLIENT_MATERIAL_INTAKE_SERVICE]).toMatchObject({
      lifetime: 'SCOPED',
    })
    expect(() => clientMaterialIntakeInputSchema.parse({
      ...intakeInput,
      toneOfVoice: 'playful',
    })).toThrow()
  })

  it('rejects a customer user that is not linked to the asserted company before storage', async () => {
    const createScoped = jest.fn()
    const processCase = jest.fn()
    const container = {
      resolve(name: string) {
        if (name === 'attachmentService') return { createScoped }
        if (name === 'agencyCaseWorkflowService') return { processCase }
        if (name === 'customerUserService') {
          return {
            findById: async () => ({
              id: CUSTOMER_USER_ID,
              customerEntityId: '77777777-7777-4777-8777-777777777777',
              isActive: true,
            }),
          }
        }
        throw new Error(`[internal] Unexpected DI service: ${name}`)
      },
    } as unknown as AppContainer

    await expect(callAsPortalAdapter(createClientMaterialIntakeService(container))).rejects.toThrow(
      'Customer identity does not own the intake scope',
    )
    expect(createScoped).not.toHaveBeenCalled()
    expect(processCase).not.toHaveBeenCalled()
  })

  it('lets a portal adapter store and link material before starting the scoped case workflow', async () => {
    const order: string[] = []
    let persistedCase: AgencyCase | null = null
    const tx = {
      create: (_entity: typeof AgencyCase, values: Partial<AgencyCase>) =>
        Object.assign(new AgencyCase(), values),
      persist: (agencyCase: AgencyCase) => {
        persistedCase = agencyCase
        order.push('case:persist')
        return tx
      },
    } as unknown as EntityManager

    let attachmentInput: Parameters<AttachmentService['createScoped']>[0] | null = null
    const attachmentService = {
      async createScoped(input: Parameters<AttachmentService['createScoped']>[0]) {
        attachmentInput = input
        order.push('attachment:store')
        await input.persistLink?.(tx, ATTACHMENT_ID)
        order.push('attachment:commit')
        return {
          id: ATTACHMENT_ID,
          url: `/api/attachments/file/${ATTACHMENT_ID}`,
          fileName: 'brief.pdf',
          mimeType: 'application/pdf',
          fileSize: FILE_BUFFER.length,
        }
      },
    } as AttachmentService

    const workflowService: AgencyCaseWorkflowService = {
      async processCase(input) {
        expect(order).toEqual(['attachment:store', 'case:persist', 'attachment:commit'])
        order.push('workflow:start')
        return {
          caseId: input.caseId,
          workflowInstanceId: WORKFLOW_INSTANCE_ID,
          status: 'COMPLETED',
          currentStep: 'end',
          agentOutput: {
            kind: 'no_op',
            unchanged: true,
            input: {
              caseId: input.caseId,
              tenantId: TENANT_ID,
              organizationId: ORGANIZATION_ID,
              customerEntityId: CUSTOMER_ENTITY_ID,
              submittedByCustomerUserId: CUSTOMER_USER_ID,
              title: intakeInput.title,
              agentWorkerId: AGENCY_AGENT_WORKER_ID,
              materialFileName: intakeInput.file.fileName,
              materialMimeType: intakeInput.file.mimeType,
              materialFileSize: FILE_BUFFER.length,
            },
          },
        }
      },
    }
    const container = {
      resolve(name: string) {
        if (name === 'attachmentService') return attachmentService
        if (name === 'agencyCaseWorkflowService') return workflowService
        if (name === 'customerUserService') {
          return {
            findById: async () => ({
              id: CUSTOMER_USER_ID,
              customerEntityId: CUSTOMER_ENTITY_ID,
              isActive: true,
            }),
          }
        }
        throw new Error(`[internal] Unexpected DI service: ${name}`)
      },
    } as unknown as AppContainer

    const result = await callAsPortalAdapter(createClientMaterialIntakeService(container))
    const agencyCase = persistedCase as AgencyCase | null

    expect(agencyCase).toMatchObject({
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      customerEntityId: CUSTOMER_ENTITY_ID,
      submittedByCustomerUserId: CUSTOMER_USER_ID,
      title: intakeInput.title,
      agentWorkerId: AGENCY_AGENT_WORKER_ID,
      materialAttachmentId: ATTACHMENT_ID,
      materialFileName: intakeInput.file.fileName,
      materialMimeType: intakeInput.file.mimeType,
      materialFileSize: FILE_BUFFER.length,
    })
    expect(attachmentInput).toEqual(expect.objectContaining({
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      entityId: AGENCY_CASE_ATTACHMENT_ENTITY_ID,
      recordId: agencyCase?.id,
      partitionCode: AGENCY_CASE_ATTACHMENT_PARTITION_CODE,
      assignments: [{ type: AGENCY_CASE_ATTACHMENT_ENTITY_ID, id: agencyCase?.id }],
    }))
    expect(order).toEqual([
      'attachment:store',
      'case:persist',
      'attachment:commit',
      'workflow:start',
    ])
    expect(result).toEqual({
      caseId: agencyCase?.id,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      status: 'COMPLETED',
    })
  })
})
