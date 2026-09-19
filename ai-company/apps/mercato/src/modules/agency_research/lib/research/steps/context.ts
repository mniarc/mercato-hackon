import type { EntityManager } from '@mikro-orm/postgresql'
import type { InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import type { QaFinding } from '../../../data/schemas/qa'
import type { ResearchScope } from '../../store'
import type { FetchPage, SocialPost } from '../fetch'
import type { SearchWeb } from '../firecrawl'
import type { Ledger, LedgerEvent } from '../ledger'
import type { ModelSet, PipelineCache, PipelineEvent, ResearchAgentRunner } from '../pipeline'

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
  /** QA findings addressed to this step on a repair pass (3.7 / 4.2 loops), else empty. */
  repairFindings: QaFinding[]
  attempt: number
}

export type StepOutcome = {
  taskRunId: string
  versionId: string | null
  status: string
}
