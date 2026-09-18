import { z } from 'zod'

export const CLIENT_MATERIAL_INTAKE_SERVICE = 'clientMaterialIntakeService' as const
export const AGENCY_CASE_ATTACHMENT_ENTITY_ID = 'agency_operations:agency_case' as const
export const AGENCY_CASE_ATTACHMENT_PARTITION_CODE = 'privateAttachments' as const

export const tovProcessRequestSchema = z.object({
  kind: z.literal('tone_of_voice'),
  brand: z.string().trim().min(1).max(200),
  outputLanguage: z.enum(['en', 'pl']),
}).strict()
export type TovProcessRequest = z.infer<typeof tovProcessRequestSchema>

export const clientMaterialIntakeInputSchema = z.object({
  identity: z.object({
    tenantId: z.uuid(),
    organizationId: z.uuid(),
    customerEntityId: z.uuid(),
    customerUserId: z.uuid(),
  }).strict(),
  title: z.string().trim().min(1).max(200),
  process: tovProcessRequestSchema.optional(),
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
  status: 'COMPLETED' | 'RUNNING' | 'WAITING_FOR_ACTIVITIES' | 'PAUSED' | 'FAILED' | 'CANCELLED'
}

export type ClientMaterialIntakeService = {
  submitMaterial: (input: ClientMaterialIntakeInput) => Promise<ClientMaterialIntakeResult>
}
