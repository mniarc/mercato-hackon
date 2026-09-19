import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchSource, AgencyResearchTaskRun } from '../data/entities'
import { documentIssueSchema, outputIdByTemplate, type DocumentIssue, type DocumentStatus, type InputVersion, type TemplateId } from '../data/schemas/envelope'
import type { CollectedSource } from './research/fetch'
import { buildEnvelope, documentIdFor, versionLabel } from './research/envelope'
import type { LedgerSnapshot } from './research/ledger'
import { sha256 } from './research/util'

/**
 * Persistence for the research lane (pattern: `agency_tov/lib/store.ts`). Every
 * function takes the tenant scope explicitly; documents are append-only versions.
 */

export type ResearchScope = { tenantId: string; organizationId: string }

export type StartTaskRunInput = {
  orderRef: string
  brand: string
  stepId: string
  attempt: number
  runner: string
  models: unknown
  inputVersions: InputVersion[]
}

/** Recorded before the first agent call, so a crash leaves a `running` row, never nothing. */
export async function startTaskRun(em: EntityManager, scope: ResearchScope, input: StartTaskRunInput): Promise<AgencyResearchTaskRun> {
  const run = em.create(AgencyResearchTaskRun, { ...scope, ...input, status: 'running' })
  em.persist(run)
  await em.flush()
  return run
}

export async function finishTaskRun(
  em: EntityManager,
  run: AgencyResearchTaskRun,
  outcome: { status: string; outputVersionId?: string | null; summary?: unknown; qaResult?: unknown; agentRunIds?: string[]; cost?: LedgerSnapshot | null; error?: string | null },
): Promise<void> {
  run.status = outcome.status
  run.finishedAt = new Date()
  if (outcome.outputVersionId !== undefined) run.outputVersionId = outcome.outputVersionId
  if (outcome.summary !== undefined) run.summary = outcome.summary
  if (outcome.qaResult !== undefined) run.qaResult = outcome.qaResult
  if (outcome.agentRunIds !== undefined) run.agentRunIds = outcome.agentRunIds
  if (outcome.cost !== undefined) run.cost = outcome.cost ? ownCost(run, outcome.cost) : outcome.cost
  if (outcome.error !== undefined) run.error = outcome.error
  await em.flush()
}

/**
 * The ledger is per process run and cumulative; a task run stores only the calls
 * made for its own step since it started, so that summing task runs gives the
 * order's real spend (a QA task run does not own the repairs it triggered — those
 * are their own task runs). `run_total` keeps the cumulative figure for context.
 */
function ownCost(run: AgencyResearchTaskRun, snapshot: LedgerSnapshot): LedgerSnapshot & { run_total: number } {
  const since = run.createdAt.getTime()
  const own = snapshot.entries.filter((entry) => entry.step === run.stepId && (entry.at ?? since) >= since)
  return { ...snapshot, entries: own, total: own.reduce((sum, entry) => sum + entry.costPln, 0), run_total: snapshot.total }
}

/** Stores every fetch attempt as a row (unavailable ones included); idempotent per (order, source_id). */
export async function saveSources(em: EntityManager, scope: ResearchScope, orderRef: string, taskRunId: string, sources: CollectedSource[]): Promise<AgencyResearchSource[]> {
  const rows: AgencyResearchSource[] = []
  for (const source of sources) {
    let row = await em.findOne(AgencyResearchSource, { ...scope, orderRef, sourceId: source.source_id })
    if (!row) {
      row = em.create(AgencyResearchSource, {
        ...scope,
        orderRef,
        sourceId: source.source_id,
        canonicalSourceId: source.source_id,
        url: source.url,
        publisher: source.publisher,
        kind: source.kind,
        channel: source.channel,
        origin: source.origin,
        access: source.access,
        title: source.title,
        retrievedAt: new Date(source.retrieved_at),
        publishedAt: source.published_at ? new Date(source.published_at) : null,
        contentMd: source.text,
        contentSha256: source.text ? sha256(source.text) : null,
        bytes: source.bytes,
        readScope: source.read_scope,
        limitation: source.limitation,
        taskRunId,
      })
      em.persist(row)
    }
    rows.push(row)
  }
  await em.flush()
  return rows
}

export type SaveVersionInput = {
  orderRef: string
  brand: string
  templateId: TemplateId
  status: DocumentStatus
  inputVersions: InputVersion[]
  data: Record<string, unknown>
  issues: DocumentIssue[]
  renderedMd: string
  clientViewMd?: string | null
  taskRunId: string
  qaResult?: unknown
  simulation?: boolean
}

/**
 * Appends a version to the (order, template) document, creating the document on
 * first use, and moves `current_version_id`. Versions never change; a rerun over
 * the same order is a new version with its own pinned inputs.
 */
export async function saveDocumentVersion(
  em: EntityManager,
  scope: ResearchScope,
  input: SaveVersionInput,
): Promise<{ document: AgencyResearchDocument; version: AgencyResearchDocumentVersion; envelope: ReturnType<typeof buildEnvelope> }> {
  let document = await em.findOne(AgencyResearchDocument, { ...scope, orderRef: input.orderRef, templateId: input.templateId, deletedAt: null })
  if (!document) {
    document = em.create(AgencyResearchDocument, {
      ...scope,
      orderRef: input.orderRef,
      brand: input.brand,
      templateId: input.templateId,
      outputId: outputIdByTemplate[input.templateId],
      status: input.status,
    })
    em.persist(document)
    await em.flush()
  }
  const latest = await em.findOne(AgencyResearchDocumentVersion, { documentId: document.id }, { orderBy: { versionNo: 'desc' } })
  const versionNo = (latest?.versionNo ?? 0) + 1
  const envelope = buildEnvelope({
    templateId: input.templateId,
    orderRef: input.orderRef,
    versionNo,
    status: input.status,
    inputVersions: input.inputVersions,
    data: input.data,
    issues: input.issues,
    simulation: input.simulation,
  })
  const version = em.create(AgencyResearchDocumentVersion, {
    ...scope,
    documentId: document.id,
    orderRef: input.orderRef,
    templateId: input.templateId,
    versionNo,
    schemaVersion: envelope.schema_version,
    status: input.status,
    inputVersions: envelope.input_versions,
    fieldEvidence: envelope.field_evidence,
    approvalRecords: envelope.approval_records,
    simulationFlag: envelope.simulation_flag,
    data: input.data,
    issues: input.issues,
    renderedMd: input.renderedMd,
    clientViewMd: input.clientViewMd ?? null,
    taskRunId: input.taskRunId,
    qaResult: input.qaResult ?? null,
  })
  em.persist(version)
  await em.flush()
  document.currentVersionId = version.id
  document.status = input.status
  await em.flush()
  return { document, version, envelope }
}

/** The pinned reference of a document's current version, as later steps cite it in `input_versions`. */
export async function currentInputVersion(em: EntityManager, scope: ResearchScope, orderRef: string, templateId: TemplateId): Promise<(InputVersion & { versionId: string; data: unknown; issues?: DocumentIssue[] }) | null> {
  const document = await em.findOne(AgencyResearchDocument, { ...scope, orderRef, templateId, deletedAt: null })
  if (!document?.currentVersionId) return null
  const version = await em.findOne(AgencyResearchDocumentVersion, { id: document.currentVersionId })
  if (!version) return null
  return { document_id: documentIdFor(templateId, orderRef), version: versionLabel(version.versionNo), status: version.status, versionId: version.id, data: version.data, issues: documentIssueSchema.array().parse(version.issues ?? []) }
}

export type OrderStatus = {
  documents: { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null; updatedAt: Date | null }[]
  taskRuns: { id: string; stepId: string; attempt: number; status: string; runner: string; costPln: number; agentRuns: number; outputVersionId: string | null; error: string | null; qaResult: unknown; createdAt: Date; finishedAt: Date | null }[]
  totalPln: number
  sources: number
}

export async function orderStatus(em: EntityManager, scope: ResearchScope, orderRef: string): Promise<OrderStatus> {
  const documents = await findWithDecryption(em, AgencyResearchDocument, { ...scope, orderRef, deletedAt: null }, { orderBy: { templateId: 'asc' } }, scope)
  const versions = await findWithDecryption(em, AgencyResearchDocumentVersion, { ...scope, orderRef }, { orderBy: { versionNo: 'desc' } }, scope)
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef }, { orderBy: { createdAt: 'asc' } }, scope)
  const sources = await em.count(AgencyResearchSource, { ...scope, orderRef })
  const costOf = (run: AgencyResearchTaskRun) => {
    const cost = run.cost as { total?: number } | null
    return cost?.total ?? 0
  }
  return {
    documents: documents.map((d) => {
      const current = versions.find((v) => v.id === d.currentVersionId) ?? null
      return { templateId: d.templateId, outputId: d.outputId, status: d.status, versionNo: current?.versionNo ?? null, versionId: current?.id ?? null, updatedAt: d.updatedAt ?? null }
    }),
    taskRuns: runs.map((r) => ({
      id: r.id,
      stepId: r.stepId,
      attempt: r.attempt,
      status: r.status,
      runner: r.runner,
      costPln: costOf(r),
      agentRuns: Array.isArray(r.agentRunIds) ? r.agentRunIds.length : 0,
      outputVersionId: r.outputVersionId,
      error: r.error,
      qaResult: r.qaResult ?? null,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    })),
    totalPln: runs.reduce((sum, r) => sum + costOf(r), 0),
    sources,
  }
}

export type OrderSummary = {
  orderRef: string
  brand: string
  documents: number
  taskRuns: number
  lastStep: string | null
  lastStatus: string | null
  totalPln: number
  firstRunAt: Date | null
  lastActivityAt: Date | null
}

/**
 * Every order the scope has research for, newest activity first — the staff
 * list behind Backend → Agency research. Spend is summed the way `orderStatus`
 * sums it (the ledger snapshot of each task run), so both screens agree.
 */
export async function listOrders(em: EntityManager, scope: ResearchScope): Promise<OrderSummary[]> {
  const documents = await findWithDecryption(em, AgencyResearchDocument, { ...scope, deletedAt: null }, { orderBy: { updatedAt: 'desc' } }, scope)
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope }, { orderBy: { createdAt: 'asc' } }, scope)
  const byRef = new Map<string, OrderSummary>()
  const summaryOf = (orderRef: string, brand: string): OrderSummary => {
    const existing = byRef.get(orderRef)
    if (existing) return existing
    const created: OrderSummary = { orderRef, brand, documents: 0, taskRuns: 0, lastStep: null, lastStatus: null, totalPln: 0, firstRunAt: null, lastActivityAt: null }
    byRef.set(orderRef, created)
    return created
  }
  const later = (a: Date | null, b: Date | null): Date | null => (!a ? b : !b ? a : a > b ? a : b)
  for (const document of documents) {
    const summary = summaryOf(document.orderRef, document.brand)
    summary.documents += 1
    summary.lastActivityAt = later(summary.lastActivityAt, document.updatedAt ?? document.createdAt)
  }
  for (const run of runs) {
    const summary = summaryOf(run.orderRef, run.brand)
    summary.taskRuns += 1
    summary.lastStep = run.stepId
    summary.lastStatus = run.status
    const cost = run.cost as { total?: number } | null
    summary.totalPln += cost?.total ?? 0
    summary.firstRunAt = summary.firstRunAt ?? run.createdAt
    summary.lastActivityAt = later(summary.lastActivityAt, run.finishedAt ?? run.createdAt)
  }
  return [...byRef.values()].sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0))
}

export type LiveAgentRun = {
  id: string
  agentId: string
  stepId: string | null
  status: string
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  costMinor: number | null
  createdAt: Date
  completedAt: Date | null
}

/**
 * The agent calls behind an order as they happen — including the ones still
 * running, which no task run lists yet. Case-driven runs are linked through the
 * case's workflow instance; CLI runs only through the ids the task runs saved.
 * A read-only join over the orchestrator's table, newest first, capped.
 */
export async function liveAgentRuns(em: EntityManager, scope: ResearchScope, orderRef: string, limit = 80): Promise<LiveAgentRun[]> {
  const runs = await findWithDecryption(em, AgencyResearchTaskRun, { ...scope, orderRef }, { fields: ['agentRunIds'] }, scope)
  const known = [...new Set(runs.flatMap((run) => (Array.isArray(run.agentRunIds) ? run.agentRunIds : []) as string[]))]
  const rows = await em.getConnection().execute<Array<Record<string, unknown>>>(
    `select r.id, r.agent_id, r.step_id, r.status, r.model, r.input_tokens, r.output_tokens, r.cost_minor, r.created_at, r.completed_at
       from agent_runs r
      where r.tenant_id = ? and r.organization_id = ?
        and (r.workflow_instance_id = (select c.workflow_instance_id from agency_cases c where c.id::text = ? and c.tenant_id = ? and c.organization_id = ?)
             or r.id = any(?::uuid[]))
      order by r.created_at desc
      limit ?`,
    [scope.tenantId, scope.organizationId, orderRef, scope.tenantId, scope.organizationId, known, limit],
  )
  return rows.map((row) => ({
    id: String(row.id),
    agentId: String(row.agent_id),
    stepId: row.step_id ? String(row.step_id) : null,
    status: String(row.status),
    model: row.model ? String(row.model) : null,
    inputTokens: row.input_tokens === null || row.input_tokens === undefined ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null || row.output_tokens === undefined ? null : Number(row.output_tokens),
    costMinor: row.cost_minor === null || row.cost_minor === undefined ? null : Number(row.cost_minor),
    createdAt: new Date(String(row.created_at)),
    completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
  }))
}
