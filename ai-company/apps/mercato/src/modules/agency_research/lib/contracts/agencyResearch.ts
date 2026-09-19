import { z } from 'zod'
import { orderDataSchema } from '../../data/schemas/zamowienie'

/**
 * The seam other modules use (ADR-001): resolve `AGENCY_RESEARCH_SERVICE` from the
 * container — never import this module's internals. The spine's workflow function
 * and the customer portal call `run()` with a trusted server execution identity
 * and get back references, not documents.
 */

export const AGENCY_RESEARCH_SERVICE = 'agencyResearchService' as const

export const researchSteps = ['3.2', '3.5', '3.8', '4.2'] as const
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
  /** 3.7 verdict when QA ran: ready | to_fix | exception. */
  qaVerdict?: 'ready' | 'to_fix' | 'exception'
  /** 4.2 verdict when brief QA ran. */
  briefQaVerdict?: 'ready_for_approval' | 'needs_client_data' | 'needs_agent_fix'
  /** The WEW-ESKALACJA version opened by E.1 (QA exhausted, exception or budget), when any. */
  escalationVersionId?: string
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

/** What the customer portal renders for a brief: the projection, never the internal data. */
export type ClientView =
  | { status: 'not_ready' }
  | {
      status: string
      version: string
      client_view_md: string | null
      questions: { question_id: string; question: string; hint: string; reason: string; brief_field: string; priority: string }[]
    }

export type BriefReviewQa =
  | { state: 'missing' }
  | { state: 'unavailable'; taskRunId: string; status: string }
  | { state: 'assessed'; taskRunId: string; status: 'done' | 'to_fix'; verdict: 'ready_for_approval' | 'needs_client_data' | 'needs_agent_fix' }

/** Trusted server projection: QA is evidence for eligibility, never an approval. */
export type BriefReviewProjection = {
  orderRef: string
  documentId: string
  versionId: string
  version: string
  templateId: 'WZR-BRIEF'
  isCurrent: boolean
  documentStatus: string
  versionStatus: string
  clientViewMd: string | null
  questions: Extract<ClientView, { version: string }>['questions']
  qa: BriefReviewQa
}

export interface AgencyResearchService {
  run(input: { context: ResearchExecutionContext; request: ResearchRunRequest }): Promise<ResearchRunResult>
  /** The client projection of the current version of a document (today: `WZR-BRIEF`). */
  getClientView(scope: { tenantId: string; organizationId: string }, orderRef: string, templateId: 'WZR-BRIEF'): Promise<ClientView>
  /** Caller establishes case/customer ownership; the service enforces scope and exact version binding. */
  getBriefReview(scope: { tenantId: string; organizationId: string }, orderRef: string, versionId: string): Promise<BriefReviewProjection | null>
  status(scope: { tenantId: string; organizationId: string }, orderRef: string): Promise<{
    documents: { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null }[]
    taskRuns: { id: string; stepId: string; attempt: number; status: string; costPln: number; outputVersionId: string | null; error: string | null }[]
    totalPln: number
    sources: number
  }>
}
