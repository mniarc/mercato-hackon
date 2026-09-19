import { z } from 'zod'
import type { SpecialistTovReference } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { tovProcessRequestSchema } from '../contracts'

export const STAFF_TOV_INTAKE_SERVICE = 'agencyStaffTovIntakeService' as const
export const STAFF_TOV_COMPLETION_HANDLER = 'agencyStaffTovCompletionHandler' as const
export const STAFF_TOV_INTAKE_CONTEXT_KEY = 'staffTovIntake' as const
export const STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID = 'agency_operations:tov_intake' as const

export const staffTovIntakeRequestSchema = z.object({
  caseId: z.uuid(),
  eventId: z.string().trim().min(1).max(120),
  brand: tovProcessRequestSchema.shape.brand,
  outputLanguage: tovProcessRequestSchema.shape.outputLanguage,
}).strict()

export const staffTovIntakeContextSchema = z.object({
  intakeId: z.uuid(),
  caseId: z.uuid(),
  customerEntityId: z.uuid(),
  corpusAttachmentId: z.uuid(),
  corpusSha256: z.string().regex(/^[a-f0-9]{64}$/),
  initiatedByUserId: z.uuid(),
  eventId: staffTovIntakeRequestSchema.shape.eventId,
}).strict()

export const staffTovResearchResultSchema = z.object({
  researchRunId: z.uuid(),
  documentVersionIds: z.array(z.uuid()),
  agentRunIds: z.array(z.uuid()),
}).strict()

export const staffTovIntakeStatusSchema = z.object({
  intakeId: z.uuid(),
  caseId: z.uuid(),
  customerEntityId: z.uuid(),
  workflowInstanceId: z.uuid(),
  workflowStatus: z.string().min(1),
  currentStep: z.string().nullable(),
  state: z.enum(['accepted', 'running', 'completed', 'attention_required']),
  replayed: z.boolean(),
  result: staffTovResearchResultSchema.nullable(),
}).strict()

export const staffTovIntakeInputSchema = staffTovIntakeRequestSchema.extend({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  file: z.object({
    buffer: z.instanceof(Buffer).refine((value) => value.length > 0),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
  }).strict(),
}).strict()

export type StaffTovIntakeStatus = z.infer<typeof staffTovIntakeStatusSchema>

export type StaffTovIntakeService = {
  start: (input: z.infer<typeof staffTovIntakeInputSchema>) => Promise<StaffTovIntakeStatus>
  get: (input: {
    tenantId: string
    organizationId: string
    userId: string
    workflowInstanceId: string
  }) => Promise<StaffTovIntakeStatus>
  resolveForCase: (input: {
    tenantId: string
    organizationId: string
    caseId: string
    workflowInstanceId?: string
  }) => Promise<
    | { status: 'ready'; workflowInstanceId: string; reference: SpecialistTovReference }
    | { status: 'missing'; workflowInstanceId: string | null }
    | { status: 'running' | 'attention_required'; workflowInstanceId: string }
  >
}

export type StaffTovCompletionHandler = {
  complete: (input: {
    tenantId: string
    organizationId: string
    caseId: string
    specialistWorkflowInstanceId: string
  }) => Promise<void>
}
