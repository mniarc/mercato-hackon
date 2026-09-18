import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Durable state of the tone-of-voice lane. Everything an agent can cite lives in
 * `agency_tov_posts`; everything an agent produced lives in an immutable
 * `agency_tov_document_versions` row whose `citations` point back at post rows.
 * No ORM relations across modules — and none inside this module either: rows
 * reference each other by id, the way `agency_operations` does.
 */

/** A scraped channel: one (source, profileUrl) per tenant/organisation. One voice profile is built per row. */
@Entity({ tableName: 'agency_tov_sources' })
@Unique({ name: 'agency_tov_sources_profile_uq', properties: ['tenantId', 'organizationId', 'source', 'profileUrl'] })
export class AgencyTovSource {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /** `TovSource` — linkedin, x, website, … */
  @Property({ type: 'text' })
  source!: string

  @Property({ name: 'profile_url', type: 'text' })
  profileUrl!: string

  @Property({ name: 'display_name', type: 'text' })
  displayName!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}

/** One ingestion: a file import or an Apify scrape. A source that yielded nothing is visible here, not silently absent. */
@Entity({ tableName: 'agency_tov_scrape_runs' })
@Index({ name: 'agency_tov_scrape_runs_scope_idx', properties: ['tenantId', 'organizationId', 'createdAt'] })
export class AgencyTovScrapeRun {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  brand!: string

  /** `file` (an export already on disk) or `apify` (live scrape). */
  @Property({ type: 'text' })
  mode!: string

  /** `TovScrapeTarget[]` — what was asked for. */
  @Property({ type: 'jsonb' })
  targets!: unknown

  /** Per-source reports (items, posts, actor, error) or the file's skip list. */
  @Property({ type: 'jsonb' })
  reports!: unknown

  @Property({ name: 'posts_added', type: 'int' })
  postsAdded!: number

  @Property({ name: 'posts_existing', type: 'int' })
  postsExisting!: number

  @Property({ name: 'posts_skipped', type: 'int' })
  postsSkipped!: number

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/** The corpus. `external_id` is the platform's post id — the id agents see and cite. */
@Entity({ tableName: 'agency_tov_posts' })
@Unique({ name: 'agency_tov_posts_external_uq', properties: ['tenantId', 'organizationId', 'sourceId', 'externalId'] })
@Index({ name: 'agency_tov_posts_source_idx', properties: ['tenantId', 'organizationId', 'sourceId', 'postedAt'] })
export class AgencyTovPost {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'source_id', type: 'uuid' })
  sourceId!: string

  /** The ingestion that first stored this post. */
  @Property({ name: 'scrape_run_id', type: 'uuid' })
  scrapeRunId!: string

  @Property({ name: 'external_id', type: 'text' })
  externalId!: string

  @Property({ type: 'text' })
  url!: string

  @Property({ name: 'author_name', type: 'text' })
  authorName!: string

  @Property({ name: 'posted_at', type: Date })
  postedAt!: Date

  @Property({ type: 'text' })
  text!: string

  @Property({ type: 'int' })
  likes!: number

  @Property({ type: 'int' })
  comments!: number

  @Property({ type: 'int' })
  shares!: number

  /** `TovPostMediaKind` */
  @Property({ type: 'text' })
  media!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/** One pipeline execution over a stored corpus. `post_ids` is the exact evidence set the agents saw. */
@Entity({ tableName: 'agency_tov_research_runs' })
@Index({ name: 'agency_tov_research_runs_scope_idx', properties: ['tenantId', 'organizationId', 'brand', 'createdAt'] })
export class AgencyTovResearchRun {
  [OptionalProps]?: 'error' | 'stats' | 'groundingReport' | 'finishedAt' | 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  brand!: string

  @Property({ name: 'output_language', type: 'text' })
  outputLanguage!: string

  /** `orchestrator` or `direct`, plus the model ids the direct runner used. */
  @Property({ type: 'text' })
  runner!: string

  @Property({ type: 'jsonb' })
  models!: unknown

  /** `running` → `done` | `failed` */
  @Property({ type: 'text' })
  status!: string

  @Property({ type: 'text', nullable: true })
  error: string | null = null

  /** `agency_tov_posts.id[]` — the corpus of this run, in pipeline order. */
  @Property({ name: 'post_ids', type: 'jsonb' })
  postIds!: unknown

  @Property({ name: 'post_count', type: 'int' })
  postCount!: number

  @Property({ name: 'profile_count', type: 'int' })
  profileCount!: number

  /** `TovPipelineResult['stats']` once done. */
  @Property({ type: 'jsonb', nullable: true })
  stats: unknown = null

  /** Every grounding event of the run — what was dropped, repaired or rejected. */
  @Property({ name: 'grounding_report', type: 'jsonb', nullable: true })
  groundingReport: unknown = null

  @Property({ name: 'finished_at', type: Date, nullable: true })
  finishedAt: Date | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

/**
 * A document the lane owns: the brand's `KLI-TOV` or one `TOV-PROFILE` per author
 * (`profile_url` is '' for the brand document so the unique key holds).
 * `current_version_id` is the only "current" pointer; versions never change.
 */
@Entity({ tableName: 'agency_tov_documents' })
@Unique({ name: 'agency_tov_documents_kind_uq', properties: ['tenantId', 'organizationId', 'brand', 'kind', 'profileUrl'] })
export class AgencyTovDocument {
  [OptionalProps]?: 'currentVersionId' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  brand!: string

  /** `TovDocumentKind` */
  @Property({ type: 'text' })
  kind!: string

  @Property({ name: 'profile_url', type: 'text', default: '' })
  profileUrl: string = ''

  @Property({ type: 'text' })
  title!: string

  @Property({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}

/** Immutable. `body` is the zod-typed synthesis as a JSON string; `citations` resolve every quote in it to a post row. */
@Entity({ tableName: 'agency_tov_document_versions' })
@Unique({ name: 'agency_tov_document_versions_no_uq', properties: ['documentId', 'versionNo'] })
@Index({ name: 'agency_tov_document_versions_run_idx', properties: ['tenantId', 'organizationId', 'researchRunId'] })
export class AgencyTovDocumentVersion {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'document_id', type: 'uuid' })
  documentId!: string

  @Property({ name: 'version_no', type: 'int' })
  versionNo!: number

  @Property({ name: 'research_run_id', type: 'uuid' })
  researchRunId!: string

  @Property({ type: 'text' })
  body!: string

  @Property({ name: 'rendered_md', type: 'text' })
  renderedMd!: string

  /** `TovCitation[]` */
  @Property({ type: 'jsonb' })
  citations!: unknown

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}
