import { z } from 'zod'

export const paidCaseProcessingSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready'), workflowInstanceId: z.uuid() }),
  z.object({ state: z.literal('started'), workflowInstanceId: z.uuid(), nativeStatus: z.string(), replayed: z.boolean() }),
  z.object({ state: z.literal('waiting_configuration'), reason: z.enum([
    'execution_disabled', 'services_unavailable', 'missing_process_configuration', 'invalid_process_policy', 'product_policy_mismatch',
  ]) }),
  z.object({ state: z.literal('attention_required'), workflowInstanceId: z.uuid(), reason: z.literal('workflow_not_running'), nativeStatus: z.string() }),
])
export type PaidCaseProcessing = z.infer<typeof paidCaseProcessingSchema>
