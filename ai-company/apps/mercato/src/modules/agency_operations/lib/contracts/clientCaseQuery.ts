import { z } from 'zod'
import type { ClientMaterialIntakeInput } from './clientMaterialIntake'

export const CLIENT_CASE_QUERY_SERVICE = 'clientCaseQueryService' as const

export const clientCaseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const clientCaseItemSchema = z.object({
  caseId: z.uuid(),
  title: z.string(),
  materialFileName: z.string(),
  materialMimeType: z.string(),
  materialFileSize: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  workflow: z.object({
    status: z.enum([
      'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED',
      'COMPENSATING', 'COMPENSATED', 'WAITING_FOR_ACTIVITIES', 'FORKED',
    ]),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  }).nullable().describe('Current native workflow state, or null when no scoped workflow is available. Not a copy of workflow context.'),
})

export const clientCaseListResultSchema = z.object({
  items: z.array(clientCaseItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
})

export type ClientCaseIdentity = ClientMaterialIntakeInput['identity']
export type ClientCaseListQuery = z.infer<typeof clientCaseListQuerySchema>
export type ClientCaseItem = z.infer<typeof clientCaseItemSchema>
export type ClientCaseListResult = z.infer<typeof clientCaseListResultSchema>

export type ClientCaseQueryService = {
  list: (identity: ClientCaseIdentity, query: ClientCaseListQuery) => Promise<ClientCaseListResult>
  get: (identity: ClientCaseIdentity, caseId: string) => Promise<ClientCaseItem | null>
}
