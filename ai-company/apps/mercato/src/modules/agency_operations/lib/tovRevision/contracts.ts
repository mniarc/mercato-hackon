import { z } from 'zod'
import { tovRevisionFieldSchema } from '@/modules/agency_tov/data/validators'
import { tovRevisionPolicySchema, tovRevisionRequestSchema, tovRevisionResultSchema } from '@/modules/agency_tov/lib/revision/contracts'

export { TOV_REVISION_FUNCTION } from '@/modules/agency_tov/lib/revision/contracts'
export const PREPARE_TOV_REVISION_FUNCTION = 'agency_operations.prepareTovRevision'
export const REASSESS_TOV_PAIR_FUNCTION = 'agency_operations.reassessTovPair'
export const TOV_REVISION_REVIEW_FUNCTION = 'agency_operations.handoffRevisedTovPair'
export const TOV_REVISION_EXCEPTION_FUNCTION = 'agency_operations.handoffTovRevisionException'
export const TOV_REVISION_PREPARED_KEY = 'prepare_tov_revision_result'
export const TOV_REVISION_RESULT_KEY = 'revise_tov_result'
export const TOV_PAIR_REASSESSMENT_KEY = 'reassess_tov_pair_result'
export const TOV_REVISION_STEP = 'tov_revision'
export const tovCorrectionPolicySchema = tovRevisionPolicySchema.extend({ pairQaMaxCostPln: z.number().positive() }).strict()
export const tovChangeDirectiveSchema = z.object({
  target: z.literal('tov'), instructions: z.string().min(1).max(20000),
  affectedFields: z.array(tovRevisionFieldSchema).min(1),
}).strict()
export const preparedTovRevisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), orderRef: z.uuid(), request: tovRevisionRequestSchema }),
  z.object({ status: z.literal('not_applicable'), orderRef: z.uuid(), reason: z.string().min(1) }),
])
export const nativeTovRevisionResultSchema = z.object({ orderRef: z.uuid(), revision: tovRevisionResultSchema })
