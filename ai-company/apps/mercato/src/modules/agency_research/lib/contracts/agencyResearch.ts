import { z } from 'zod'
import { orderDataSchema } from '../../data/schemas/zamowienie'

/**
 * The seam other modules use (ADR-001): resolve `AGENCY_RESEARCH_SERVICE` from the
 * container — never import this module's internals. The spine's workflow function
 * and the customer portal call `run()` with a trusted server execution identity
 * and get back references, not documents.
 */

export const AGENCY_RESEARCH_SERVICE = 'agencyResearchService' as const

export const researchSteps = ['3.2', '3.5'] as const
export type ResearchStep = (typeof researchSteps)[number]

export const researchRunRequestSchema = z.object({
  /** The order (or case) the documents belong to; text, tenant-scoped. */
  orderRef: z.string().min(1),
  /** WEW-DANE-ZAMOWIENIA as the portal emits it. */
  order: orderDataSchema,
  /** Run the process up to and including this step. */
  through: z.enum(researchSteps).default('3.2'),
  /** Normalised social posts (the ToV corpus shape) standing in for the official profile. */
  socialPosts: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().min(1),
        text: z.string().min(1),
        postedAt: z.string().min(1),
        authorName: z.string().min(1),
        likes: z.number().int().min(0),
        comments: z.number().int().min(0),
        shares: z.number().int().min(0),
      }),
    )
    .optional(),
  /** Explicit page list instead of discovery. */
  pages: z.array(z.string().min(1)).optional(),
  /** Per-run spend cap in PLN; the module default applies when omitted. */
  maxCostPln: z.number().positive().optional(),
})
export type ResearchRunRequest = z.infer<typeof researchRunRequestSchema>

export type ResearchRunResult = {
  taskRunIds: string[]
  documentVersionIds: string[]
  /** Exact persisted native runs, including delegated children reported by the runtime. */
  agentRunIds: string[]
  spentPln: number
  /** The last step completed; `paused_budget` / `failed` runs end before `through`. */
  completedThrough: ResearchStep | null
}

export type ResearchExecutionContext = {
  tenantId: string
  organizationId: string
  /** Trusted server execution identity, never a portal customer identity. */
  userId: string
  workflowInstanceId?: string
  stepId?: string
  invocationId?: string
}

export interface AgencyResearchService {
  run(input: { context: ResearchExecutionContext; request: ResearchRunRequest }): Promise<ResearchRunResult>
  status(scope: { tenantId: string; organizationId: string }, orderRef: string): Promise<{
    documents: { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null }[]
    taskRuns: { id: string; stepId: string; attempt: number; status: string; costPln: number; outputVersionId: string | null; error: string | null }[]
    totalPln: number
    sources: number
  }>
}
