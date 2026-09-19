import type { EntityManager } from '@mikro-orm/postgresql'
import type { InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { KnownPerson, ScrapeProfilePosts } from './people'
import type { QaFinding } from '../../../data/schemas/qa'
import type { ResearchScope } from '../../store'
import type { FetchPage, SocialPost } from '../fetch'
import type { SearchWeb } from '../firecrawl'
import type { Ledger, LedgerEvent } from '../ledger'
import type { ModelSet, PipelineCache, PipelineEvent, ResearchAgentRunner } from '../pipeline'

export type StrategyExecutionInput = InputVersion & { versionId: string; data: unknown }
export type StrategyExecutionInputs = {
  brief: StrategyExecutionInput
  zrodla: StrategyExecutionInput
  audyt: StrategyExecutionInput
  konkurencja: StrategyExecutionInput
  ustalenia: StrategyExecutionInput
}
export type StrategyExecutionOutputs = { strategy: StrategyExecutionInput | null; tov: StrategyExecutionInput | null }

export type PlanningExecutionInputs = {
  strategy: StrategyExecutionInput
  tov: StrategyExecutionInput
  brief: StrategyExecutionInput
  zrodla: StrategyExecutionInput
  konkurencja: StrategyExecutionInput
}
export type PlanningExecutionOutputs = { plan: StrategyExecutionInput | null }
export type PostExecutionInputs = { instruction: StrategyExecutionInput; tov: StrategyExecutionInput }
export type PostExecutionOutputs = { post: StrategyExecutionInput | null }

/**
 * What every process step receives. A step: loads its pinned inputs through the
 * store, calls its pure pipeline function, saves one document version and one
 * task run, and returns the references. The pure function is what tests exercise
 * with the fixture runner; the step is what the service and the CLI call.
 */
export type StepContext = {
  em: EntityManager
  scope: ResearchScope
  orderRef: string
  order: OrderFacts
  /** The pinned WEW-DANE-ZAMOWIENIA version every step cites. */
  orderVersion: InputVersion
  runAgent: ResearchAgentRunner
  runner: string
  models: ModelSet
  ledger: Ledger
  cache?: PipelineCache
  concurrency?: number
  onEvent: (event: PipelineEvent | LedgerEvent) => void
  log: (message: string) => void
  agentRunIds: string[]
  taskRunIds: string[]
  documentVersionIds: string[]
  fetchPage: FetchPage
  searchWeb?: SearchWeb
  socialPosts?: SocialPost[]
  pages?: string[]
  /** 3.2a — people the client named; the finder adds those the pages name. */
  knownPeople?: KnownPerson[]
  /** 3.2a — reads a person's own posts (Apify through the ToV lane's seam); absent = their channels are only listed. */
  scrapeProfilePosts?: ScrapeProfilePosts
  /** QA findings addressed to this step on a repair pass (3.7 / 4.2 / 5.4 / 6.3 / 7.3 loops), else empty. */
  repairFindings: QaFinding[]
  attempt: number
  /** 6.5 — the topic the client selected (`TOP01`…); when absent the recommendation is taken as a simulated selection. */
  selectedTopicId?: string | null
  /** 3.4 — search for competitors again instead of reusing the stored selection (CLI `--refetch`). */
  freshSelection?: boolean
  /** Phase-only strategy execution: the accepted/frozen foundation never follows current pointers. */
  strategyInputs?: StrategyExecutionInputs
  /** Shared across shallow repair contexts; only this execution's generated pair. */
  strategyOutputs?: StrategyExecutionOutputs
  /** Snapshot of the existing QA repair limit taken when the phase starts. */
  strategyQaRepairAttempts?: number
  /** Phase-only planning uses the accepted documents and their exact research inputs. */
  planningInputs?: PlanningExecutionInputs
  planningOutputs?: PlanningExecutionOutputs
  planningQaRepairAttempts?: number
  postInputs?: PostExecutionInputs
  postOutputs?: PostExecutionOutputs
  postQaRepairAttempts?: number
}

export type StepOutcome = {
  taskRunId: string
  versionId: string | null
  status: string
}
