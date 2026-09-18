import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion, AgencyResearchSource, AgencyResearchTaskRun } from '../data/entities'
import { outputIdByTemplate, type DocumentIssue, type DocumentStatus, type InputVersion, type TemplateId } from '../data/schemas/envelope'
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
  if (outcome.cost !== undefined) run.cost = outcome.cost
  if (outcome.error !== undefined) run.error = outcome.error
  await em.flush()
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
export async function currentInputVersion(em: EntityManager, scope: ResearchScope, orderRef: string, templateId: TemplateId): Promise<(InputVersion & { versionId: string; data: unknown }) | null> {
  const document = await em.findOne(AgencyResearchDocument, { ...scope, orderRef, templateId, deletedAt: null })
  if (!document?.currentVersionId) return null
  const version = await em.findOne(AgencyResearchDocumentVersion, { id: document.currentVersionId })
  if (!version) return null
  return { document_id: documentIdFor(templateId, orderRef), version: versionLabel(version.versionNo), status: version.status, versionId: version.id, data: version.data }
}

export type OrderStatus = {
  documents: { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null; updatedAt: Date | null }[]
  taskRuns: { id: string; stepId: string; attempt: number; status: string; runner: string; costPln: number; agentRuns: number; outputVersionId: string | null; error: string | null; createdAt: Date; finishedAt: Date | null }[]
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
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
    })),
    totalPln: runs.reduce((sum, r) => sum + costOf(r), 0),
    sources,
  }
}
