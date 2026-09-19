'use client'

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { JsonDisplay } from '@open-mercato/ui/backend/JsonDisplay'
import { MarkdownContent } from '@open-mercato/ui/backend/markdown/MarkdownContent'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { formatDateTime, runStatusVariant } from '../../_components/ResearchOrdersTable'

type TaskRun = {
  id: string; stepId: string; attempt: number; status: string; runner: string
  costPln: number; agentRuns: number; outputVersionId: string | null
  error: string | null; createdAt: string; finishedAt: string | null
}
type LedgerDocument = { templateId: string; outputId: string; status: string; versionNo: number | null; versionId: string | null; updatedAt: string | null }
type AgentRun = { id: string; agentId: string; stepId: string | null; status: string; model: string | null; inputTokens: number | null; outputTokens: number | null; costMinor: number | null; createdAt: string; completedAt: string | null }
type Ledger = { orderRef: string; totalPln: number; sources: number; documents: LedgerDocument[]; taskRuns: TaskRun[]; agentRuns?: AgentRun[] }
type VersionEnvelope = {
  id: string; document_id: string; template_id: string; order_id: string; version: string; version_no: number
  status: string; simulation_flag: boolean; issues: unknown; qa_result: unknown; task_run_id: string; created_at: string
}
type VersionBody = VersionEnvelope & { data: unknown; rendered_md: string | null; client_view_md: string | null }
type BodyView = 'internal' | 'client' | 'json'

const key = 'agencyResearch.orders.detail'

function documentStatusVariant(status: string): StatusBadgeVariant {
  if (status === 'approved' || status === 'ready_for_review' || status === 'ready') return 'success'
  if (status === 'blocked' || status === 'rejected') return 'error'
  if (status === 'draft') return 'warning'
  return 'neutral'
}

function issueCount(issues: unknown): number {
  return Array.isArray(issues) ? issues.length : 0
}

export function ResearchOrderDetail({ orderRef }: { orderRef?: string }) {
  const translate = useT()
  const locale = useLocale()
  const scopeVersion = useOrganizationScopeVersion()
  const [ledger, setLedger] = React.useState<Ledger | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [runsPage, setRunsPage] = React.useState(1)
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null)
  const [versions, setVersions] = React.useState<VersionEnvelope[]>([])
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [body, setBody] = React.useState<VersionBody | null>(null)
  const [bodyError, setBodyError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<BodyView>('internal')
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!orderRef) { setLoading(false); setError(`${key}.missingRef`); return }
    let cancelled = false
    if (tick === 0) setLoading(true)
    setError(null)
    void apiCall<Ledger>(`/api/agency_research/task-runs?order_ref=${encodeURIComponent(orderRef)}`)
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result) {
          setError(response.status === 403 ? `${key}.forbidden` : `${key}.unavailable`)
        } else if (!Array.isArray(response.result.documents) || !Array.isArray(response.result.taskRuns)) {
          setError(`${key}.unavailable`)
        } else {
          setLedger(response.result)
          const first = response.result.documents[0]
          if (first) setSelectedTemplate((current) => current ?? first.templateId)
        }
      })
      .catch(() => { if (!cancelled) setError(`${key}.unavailable`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orderRef, scopeVersion, tick])

  // While a step is running (or a call is in flight) the ledger and the agent calls refresh every 10 s.
  const inFlight = Boolean(ledger?.taskRuns.some((run) => run.status === 'running') || ledger?.agentRuns?.some((run) => run.status === 'running'))
  React.useEffect(() => {
    if (!inFlight) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 10000)
    return () => window.clearInterval(timer)
  }, [inFlight])

  React.useEffect(() => {
    if (!orderRef || !selectedTemplate) return
    let cancelled = false
    setVersions([])
    void apiCall<{ items: VersionEnvelope[] }>(`/api/agency_research/document-versions?order_ref=${encodeURIComponent(orderRef)}&template_id=${encodeURIComponent(selectedTemplate)}`)
      .then((response) => {
        if (cancelled || !response.ok || !response.result) return
        const items = Array.isArray(response.result.items) ? response.result.items : []
        setVersions(items)
        const current = ledger?.documents.find((document) => document.templateId === selectedTemplate)?.versionId ?? items[0]?.id ?? null
        // A version opened from the ledger keeps its selection; otherwise the document's current version is shown.
        setSelectedVersionId((selected) => (selected && items.some((item) => item.id === selected) ? selected : current))
      })
      .catch(() => { if (!cancelled) setBodyError(`${key}.versionUnavailable`) })
    return () => { cancelled = true }
  }, [ledger, orderRef, selectedTemplate])

  React.useEffect(() => {
    if (!selectedVersionId) return
    let cancelled = false
    setBody(null)
    setBodyError(null)
    void apiCall<VersionBody>(`/api/agency_research/document-versions?id=${encodeURIComponent(selectedVersionId)}`)
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result || response.result.id !== selectedVersionId) {
          setBodyError(response.status === 403 ? `${key}.forbidden` : `${key}.versionUnavailable`)
        } else {
          setBody(response.result)
          setSelectedTemplate(response.result.template_id)
        }
      })
      .catch(() => { if (!cancelled) setBodyError(`${key}.versionUnavailable`) })
    return () => { cancelled = true }
  }, [selectedVersionId])

  const openVersion = React.useCallback((versionId: string) => setSelectedVersionId(versionId), [])

  const documentColumns = React.useMemo<ColumnDef<LedgerDocument>[]>(() => [
    { accessorKey: 'templateId', header: translate(`${key}.documents.template`) },
    { accessorKey: 'outputId', header: translate(`${key}.documents.output`) },
    { accessorKey: 'status', header: translate(`${key}.documents.status`), cell: ({ row }) => <StatusBadge variant={documentStatusVariant(row.original.status)}>{row.original.status}</StatusBadge> },
    { accessorKey: 'versionNo', header: translate(`${key}.documents.version`), cell: ({ row }) => row.original.versionNo === null ? '—' : `v${row.original.versionNo}` },
    { accessorKey: 'updatedAt', header: translate(`${key}.documents.updatedAt`), cell: ({ row }) => formatDateTime(row.original.updatedAt, locale, '—') },
  ], [locale, translate])

  const agentColumns = React.useMemo<ColumnDef<AgentRun>[]>(() => [
    { accessorKey: 'createdAt', header: translate(`${key}.agents.startedAt`), cell: ({ row }) => formatDateTime(row.original.createdAt, locale, '—') },
    { accessorKey: 'agentId', header: translate(`${key}.agents.agent`), cell: ({ row }) => row.original.agentId.replace(/^agency_research\./, ''), meta: { maxWidth: '260px', truncate: true } },
    { accessorKey: 'status', header: translate(`${key}.agents.status`), cell: ({ row }) => <StatusBadge variant={row.original.status === 'ok' ? 'success' : row.original.status === 'running' ? 'warning' : row.original.status === 'error' || row.original.status === 'failed' ? 'error' : 'neutral'}>{row.original.status}</StatusBadge> },
    { accessorKey: 'model', header: translate(`${key}.agents.model`), cell: ({ row }) => row.original.model?.replace(/^openrouter\//, '') ?? '—', meta: { maxWidth: '200px', truncate: true } },
    { accessorKey: 'inputTokens', header: translate(`${key}.agents.tokens`), cell: ({ row }) => row.original.inputTokens === null ? '—' : `${row.original.inputTokens} / ${row.original.outputTokens ?? '—'}` },
    { accessorKey: 'costMinor', header: translate(`${key}.agents.cost`), cell: ({ row }) => row.original.costMinor === null ? '—' : (row.original.costMinor / 100).toFixed(2) },
    { accessorKey: 'completedAt', header: translate(`${key}.agents.duration`), cell: ({ row }) => row.original.completedAt ? `${Math.max(0, Math.round((new Date(row.original.completedAt).getTime() - new Date(row.original.createdAt).getTime()) / 1000))} s` : '…' },
  ], [locale, translate])

  const runColumns = React.useMemo<ColumnDef<TaskRun>[]>(() => [
    { accessorKey: 'stepId', header: translate(`${key}.runs.step`) },
    { accessorKey: 'attempt', header: translate(`${key}.runs.attempt`) },
    { accessorKey: 'status', header: translate(`${key}.runs.status`), cell: ({ row }) => <StatusBadge variant={runStatusVariant(row.original.status)}>{row.original.status}</StatusBadge> },
    { accessorKey: 'runner', header: translate(`${key}.runs.runner`), meta: { maxWidth: '200px', truncate: true } },
    { accessorKey: 'agentRuns', header: translate(`${key}.runs.agentRuns`) },
    { accessorKey: 'costPln', header: translate(`${key}.runs.cost`), cell: ({ row }) => row.original.costPln.toFixed(2) },
    { accessorKey: 'createdAt', header: translate(`${key}.runs.startedAt`), cell: ({ row }) => formatDateTime(row.original.createdAt, locale, '—') },
    { accessorKey: 'error', header: translate(`${key}.runs.error`), cell: ({ row }) => row.original.error ?? '—', meta: { maxWidth: '320px', truncate: true } },
    {
      accessorKey: 'outputVersionId',
      header: translate(`${key}.runs.output`),
      cell: ({ row }) => row.original.outputVersionId ? (
        <Button type="button" variant="outline" size="sm" onClick={() => openVersion(row.original.outputVersionId!)}>
          {translate(`${key}.runs.open`)}
        </Button>
      ) : '—',
    },
  ], [locale, openVersion, translate])

  if (loading) return <LoadingMessage label={translate(`${key}.loading`)} />
  if (error) return <ErrorMessage label={translate(error)} />
  if (!ledger || !orderRef) return null

  const runsPageSize = 25
  const runsTotalPages = Math.max(1, Math.ceil(ledger.taskRuns.length / runsPageSize))
  const markdown = view === 'client' ? body?.client_view_md : body?.rendered_md

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border bg-card p-6">
        <SectionHeader title={orderRef} />
        <p className="text-sm text-muted-foreground">
          {translate(`${key}.summary`, { documents: ledger.documents.length, runs: ledger.taskRuns.length, sources: ledger.sources, total: ledger.totalPln.toFixed(2) })}
        </p>
        <p className="text-sm text-muted-foreground">{translate(`${key}.noApproval`)}</p>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <SectionHeader title={translate(`${key}.documents.title`)} />
        <DataTable<LedgerDocument>
          columns={documentColumns}
          data={ledger.documents}
          emptyState={translate(`${key}.documents.empty`)}
          onRowClick={(row) => setSelectedTemplate(row.templateId)}
        />
      </section>

      {selectedTemplate ? (
        <section className="space-y-4 rounded-lg border bg-card p-6">
          <SectionHeader
            title={`${selectedTemplate}`}
            action={(
              <div className="flex flex-wrap items-center gap-2">
                {versions.map((version) => (
                  <Button
                    key={version.id}
                    type="button"
                    size="sm"
                    variant={version.id === selectedVersionId ? 'default' : 'outline'}
                    onClick={() => setSelectedVersionId(version.id)}
                  >
                    v{version.version_no} · {version.status}{version.simulation_flag ? ' · sim' : ''}
                  </Button>
                ))}
              </div>
            )}
          />
          {body ? (
            <p className="text-sm text-muted-foreground">
              {translate(`${key}.version.meta`, { created: formatDateTime(body.created_at, locale, '—'), issues: issueCount(body.issues), taskRun: body.task_run_id })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={view === 'internal' ? 'default' : 'outline'} onClick={() => setView('internal')}>{translate(`${key}.view.internal`)}</Button>
            <Button type="button" size="sm" variant={view === 'client' ? 'default' : 'outline'} onClick={() => setView('client')} disabled={!body?.client_view_md}>{translate(`${key}.view.client`)}</Button>
            <Button type="button" size="sm" variant={view === 'json' ? 'default' : 'outline'} onClick={() => setView('json')}>{translate(`${key}.view.json`)}</Button>
          </div>
          {bodyError ? <ErrorMessage label={translate(bodyError)} /> : null}
          {!body && !bodyError && selectedVersionId ? <LoadingMessage label={translate(`${key}.version.loading`)} /> : null}
          {body && view !== 'json' ? (
            markdown ? <MarkdownContent body={markdown} format="markdown" className="prose prose-sm max-w-none dark:prose-invert" /> : <p className="text-sm text-muted-foreground">{translate(`${key}.version.noMarkdown`)}</p>
          ) : null}
          {body && view === 'json' ? (
            <div className="space-y-4">
              {issueCount(body.issues) ? <JsonDisplay title={translate(`${key}.version.issues`)} data={body.issues} /> : null}
              {body.qa_result ? <JsonDisplay title={translate(`${key}.version.qa`)} data={body.qa_result} /> : null}
              <JsonDisplay title={translate(`${key}.version.data`)} data={body.data} />
            </div>
          ) : null}
        </section>
      ) : null}

      {ledger.agentRuns?.length ? (
        <section className="space-y-4 rounded-lg border bg-card p-6">
          <SectionHeader
            title={translate(`${key}.agents.title`)}
            action={inFlight ? <StatusBadge variant="warning">{translate(`${key}.agents.live`)}</StatusBadge> : null}
          />
          <p className="text-sm text-muted-foreground">
            {translate(`${key}.agents.summary`, {
              count: ledger.agentRuns.length,
              running: ledger.agentRuns.filter((run) => run.status === 'running').length,
              cost: (ledger.agentRuns.reduce((sum, run) => sum + (run.costMinor ?? 0), 0) / 100).toFixed(2),
            })}
          </p>
          <DataTable<AgentRun> columns={agentColumns} data={ledger.agentRuns.slice(0, 30)} emptyState={translate(`${key}.agents.empty`)} />
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <SectionHeader title={translate(`${key}.runs.title`)} />
        <DataTable<TaskRun>
          columns={runColumns}
          data={ledger.taskRuns.slice((runsPage - 1) * runsPageSize, runsPage * runsPageSize)}
          emptyState={translate(`${key}.runs.empty`)}
          pagination={{ page: runsPage, pageSize: runsPageSize, total: ledger.taskRuns.length, totalPages: runsTotalPages, onPageChange: setRunsPage }}
        />
      </section>
    </div>
  )
}
