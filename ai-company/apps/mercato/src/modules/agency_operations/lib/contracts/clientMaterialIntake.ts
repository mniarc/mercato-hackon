import { z } from 'zod'

export const CLIENT_MATERIAL_INTAKE_SERVICE = 'clientMaterialIntakeService' as const
export const AGENCY_CASE_ATTACHMENT_ENTITY_ID = 'agency_operations:agency_case' as const
export const AGENCY_CASE_ATTACHMENT_PARTITION_CODE = 'privateAttachments' as const

export const clientMaterialIntakeInputSchema = z.object({
  identity: z.object({
    tenantId: z.uuid(),
    organizationId: z.uuid(),
    customerEntityId: z.uuid(),
    customerUserId: z.uuid(),
  }).strict(),
  title: z.string().trim().min(1).max(200),
  file: z.object({
    buffer: z.instanceof(Buffer).refine((buffer) => buffer.length > 0),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
  }).strict(),
}).strict()

export type ClientMaterialIntakeInput = z.infer<typeof clientMaterialIntakeInputSchema>

export type ClientMaterialIntakeResult = {
  caseId: string
  workflowInstanceId: string
  status: 'COMPLETED'
}

export type ClientMaterialIntakeService = {
  submitMaterial: (input: ClientMaterialIntakeInput) => Promise<ClientMaterialIntakeResult>
}
