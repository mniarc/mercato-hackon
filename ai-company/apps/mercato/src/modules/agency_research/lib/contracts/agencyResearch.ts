import { z } from 'zod'
import { orderDataSchema } from '../../data/schemas/zamowienie'

/**
 * The seam other modules use (ADR-001): resolve `AGENCY_RESEARCH_SERVICE` from the
 * container — never import this module's internals. The spine's workflow function
 * and the customer portal call `run()` with a trusted server execution identity
 * and get back references, not documents.
 */

export const AGENCY_RESEARCH_SERVICE = 'agencyResearchService' as const

/**
 * The checkpoints a run can stop at, in STD-PROCES order. Each is the last step of
 * a phase: 3.2 sources · 3.5 audit + comparison · 3.8 findings, QA, freeze ·
 * 4.2 brief + QA · 5.4 strategy, ToV + Q-S · 6.7 plan, Q-P, selection, post
 * instruction · 7.3 post + Q-T · 8.7 publication documents (nothing is sent) ·
 * 9.3 package + closure gate.
 */
export const researchSteps = ['3.2', '3.5', '3.8', '4.2', '5.4', '6.7', '7.3', '8.7', '9.3'] as const
export type ResearchStep = (typeof researchSteps)[number]

/** Client-facing documents the portal may render through `getClientView`. */
export const clientViewTemplates = ['WZR-BRIEF', 'WZR-STRATEGIA', 'WZR-TOV', 'WZR-PLAN', 'WZR-POST', 'WZR-PAKIET'] as const
export type ClientViewTemplate = (typeof clientViewTemplates)[number]

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
  /** 6.5 — the plan topic the client selected (`TOP01`…); absent = the recommendation as a simulated selection. */
  selectedTopicId: z.string().min(1).optional(),
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
  /** 5.4 verdict when Q-S ran. */
  strategyQaVerdict?: 'ready_for_approval' | 'needs_agent_fix'
  /** 6.3 verdict when Q-P ran. */
  planQaVerdict?: 'ready_for_approval' | 'needs_agent_fix'
  /** 7.3 verdict when Q-T ran. */
  postQaVerdict?: 'pass_for_draft' | 'needs_fix' | 'reject'
  /** 9.3 — the deterministic closure gate; false while anything is simulated, unpublished or undelivered. */
  closeAllowed?: boolean
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

/** What the customer portal renders for a client-facing document: the projection, never the internal data. */
export type ClientView =
  | { status: 'not_ready' }
  | {
      status: string
      version: string
      client_view_md: string | null
      questions: { question_id: string; question: string; hint: string; reason: string; brief_field: string; priority: string }[]
    }

export interface AgencyResearchService {
  run(input: { context: ResearchExecutionContext; request: ResearchRunRequest }): Promise<ResearchRunResult>
  /** The client projection of the current version of a client-facing document; questions only for the brief. */
  getClientView(scope: { tenantId: string; organizationId: string }, orderRef: string, templateId: ClientViewTemplate): Promise<ClientView>
  status(scope: { tenantId: string; organizationId: string }, orderRef: string): Promise<{
    documents: { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null }[]
    taskRuns: { id: string; stepId: string; attempt: number; status: string; costPln: number; outputVersionId: string | null; error: string | null }[]
    totalPln: number
    sources: number
  }>
}
