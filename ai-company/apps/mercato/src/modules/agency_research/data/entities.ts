import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Durable state of the audit-and-research lane. Every document instance is a
 * COMMON-ENVELOPE version (immutable); every fetched page is a source row the
 * facts cite; every step execution is a task run carrying its spend. Rows reference
 * each other by id only — no ORM relations, inside or across modules.
 */

/** One document per (order, template): WEW-ZRODLA, WEW-AUDYT, … KLI-BRIEF. `current_version_id` is the only "current" pointer. */
@Entity({ tableName: 'agency_research_documents' })
@Unique({ name: 'agency_research_documents_order_template_uq', properties: ['tenantId', 'organizationId', 'orderRef', 'templateId'] })
export class AgencyResearchDocument {
  [OptionalProps]?: 'currentVersionId' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** The order (or case) this document belongs to — whatever the portal / spine hands us. */
  @Property({ name: 'order_ref', type: 'text' })
  orderRef!: string

  @Property({ type: 'text' })
  brand!: string

  /** WZR-* */
  @Property({ name: 'template_id', type: 'text' })
  templateId!: string

  /** WEW-* / KLI-* */
  @Property({ name: 'output_id', type: 'text' })
  outputId!: string

  @Property({ type: 'text' })
  status!: string

  @Property({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}

/** Immutable. The envelope columns are Rafał's COMMON-ENVELOPE; `data` is zod-typed per template. */
@Entity({ tableName: 'agency_research_document_versions' })
@Unique({ name: 'agency_research_document_versions_no_uq', properties: ['documentId', 'versionNo'] })
@Index({ name: 'agency_research_document_versions_order_idx', properties: ['tenantId', 'organizationId', 'orderRef', 'templateId', 'versionNo'] })
export class AgencyResearchDocumentVersion {
  [OptionalProps]?: 'clientViewMd' | 'qaResult' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'document_id', type: 'uuid' })
  documentId!: string

  @Property({ name: 'order_ref', type: 'text' })
  orderRef!: string

  @Property({ name: 'template_id', type: 'text' })
  templateId!: string

  @Property({ name: 'version_no', type: 'int' })
  versionNo!: number

  @Property({ name: 'schema_version', type: 'text' })
  schemaVersion!: string

  @Property({ type: 'text' })
  status!: string

  /** `[{document_id, version, status?}]` — the exact inputs this version was built from. */
  @Property({ name: 'input_versions', type: 'jsonb' })
  inputVersions!: unknown

  /** data key → supporting ids. */
  @Property({ name: 'field_evidence', type: 'jsonb' })
  fieldEvidence!: unknown

  @Property({ name: 'approval_records', type: 'jsonb' })
  approvalRecords!: unknown

  @Property({ name: 'simulation_flag', type: 'boolean' })
  simulationFlag!: boolean

  @Property({ type: 'jsonb' })
  data!: unknown

  /** `[{code, severity, detail, path?}]` — gaps and limitations carried forward. */
  @Property({ type: 'jsonb' })
  issues!: unknown

  @Property({ name: 'rendered_md', type: 'text' })
  renderedMd!: string

  /** The client projection per the template's client view; null for internal-only documents. */
  @Property({ name: 'client_view_md', type: 'text', nullable: true })
  clientViewMd: string | null = null

  @Property({ name: 'task_run_id', type: 'uuid' })
  taskRunId!: string

  @Property({ name: 'qa_result', type: 'jsonb', nullable: true })
  qaResult: unknown = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/** One fetch attempt or stored material. `source_id` is the S-xx the facts cite; unavailable attempts stay as rows. */
@Entity({ tableName: 'agency_research_sources' })
@Unique({ name: 'agency_research_sources_order_source_uq', properties: ['tenantId', 'organizationId', 'orderRef', 'sourceId'] })
export class AgencyResearchSource {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'order_ref', type: 'text' })
  orderRef!: string

  @Property({ name: 'source_id', type: 'text' })
  sourceId!: string

  @Property({ name: 'canonical_source_id', type: 'text' })
  canonicalSourceId!: string

  @Property({ name: 'independent_material_id', type: 'text', nullable: true })
  independentMaterialId: string | null = null

  @Property({ type: 'text' })
  url!: string

  @Property({ type: 'text' })
  publisher!: string

  @Property({ type: 'text' })
  kind!: string

  @Property({ type: 'text' })
  channel!: string

  /** purchase_form | agent | client | corpus */
  @Property({ type: 'text' })
  origin!: string

  /** full | partial | unavailable */
  @Property({ type: 'text' })
  access!: string

  @Property({ type: 'text', nullable: true })
  title: string | null = null

  @Property({ name: 'retrieved_at', type: Date })
  retrievedAt!: Date

  @Property({ name: 'published_at', type: Date, nullable: true })
  publishedAt: Date | null = null

  /** The text the facts were extracted from — the thing every quote is checked against. */
  @Property({ name: 'content_md', type: 'text', nullable: true })
  contentMd: string | null = null

  @Property({ name: 'content_sha256', type: 'text', nullable: true })
  contentSha256: string | null = null

  @Property({ type: 'int' })
  bytes!: number

  @Property({ name: 'read_scope', type: 'text' })
  readScope!: string

  @Property({ type: 'text', nullable: true })
  limitation: string | null = null

  @Property({ name: 'task_run_id', type: 'uuid' })
  taskRunId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/** One execution of one process step for one order: status, pinned inputs, produced version, agent runs and spend. */
@Entity({ tableName: 'agency_research_task_runs' })
@Index({ name: 'agency_research_task_runs_order_idx', properties: ['tenantId', 'organizationId', 'orderRef', 'stepId', 'createdAt'] })
export class AgencyResearchTaskRun {
  [OptionalProps]?: 'outputVersionId' | 'summary' | 'qaResult' | 'agentRunIds' | 'cost' | 'error' | 'finishedAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'order_ref', type: 'text' })
  orderRef!: string

  @Property({ type: 'text' })
  brand!: string

  /** 3.1 … 4.2 */
  @Property({ name: 'step_id', type: 'text' })
  stepId!: string

  @Property({ type: 'int' })
  attempt!: number

  /** running | done | to_fix | exception | failed | paused_budget */
  @Property({ type: 'text' })
  status!: string

  /** orchestrator | direct | fixture */
  @Property({ type: 'text' })
  runner!: string

  @Property({ type: 'jsonb' })
  models!: unknown

  @Property({ name: 'input_versions', type: 'jsonb' })
  inputVersions!: unknown

  @Property({ name: 'output_version_id', type: 'uuid', nullable: true })
  outputVersionId: string | null = null

  /** Step outputs that are not a document: O-3.2 business profile, stats. */
  @Property({ type: 'jsonb', nullable: true })
  summary: unknown = null

  @Property({ name: 'qa_result', type: 'jsonb', nullable: true })
  qaResult: unknown = null

  /** Orchestrator `agent_runs.id[]` this step produced. */
  @Property({ name: 'agent_run_ids', type: 'jsonb' })
  agentRunIds: unknown = []

  /** Ledger snapshot: `{currency, total, cap, entries[]}`. */
  @Property({ type: 'jsonb', nullable: true })
  cost: unknown = null

  @Property({ type: 'text', nullable: true })
  error: string | null = null

  @Property({ name: 'finished_at', type: Date, nullable: true })
  finishedAt: Date | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
