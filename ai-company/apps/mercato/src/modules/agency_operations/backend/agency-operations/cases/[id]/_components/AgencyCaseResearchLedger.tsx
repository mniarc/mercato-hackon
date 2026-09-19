'use client'

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { ResearchLineage } from './researchLineage/ResearchLineage'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'

type TaskRun = {
  id: string; stepId: string; attempt: number; status: string; runner: string;
  costPln: number; agentRuns: number; outputVersionId: string | null;
  error: string | null; createdAt: string; finishedAt: string | null;
}
type ResearchDocument = {
  templateId: string; outputId: string; status: string; versionNo: number | null;
  versionId: string | null; updatedAt: string | null;
}
type ResearchLedger = {
  orderRef: string; totalPln: number; sources: number;
  documents: ResearchDocument[]; taskRuns: TaskRun[];
}
type ResearchVersion = {
  id: string; order_id: string; status: string; template_id: string; version: string;
  data: unknown; input_versions: unknown; field_evidence: unknown; approval_records: unknown;
  simulation_flag: boolean; issues: unknown; task_run_id: string; qa_result: unknown;
}

const key = 'agencyOperations.cases.researchLedger'

function LedgerRecords({ caseId }: { caseId: string }) {
  const translate = useT()
  const [ledger, setLedger] = React.useState<ResearchLedger | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState<ResearchVersion | null>(null)
  const [versionError, setVersionError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void apiCall<ResearchLedger>(`/api/agency_research/task-runs?order_ref=${encodeURIComponent(caseId)}`)
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result) {
          setError(response.status === 403 ? `${key}.forbidden` : `${key}.unavailable`)
        } else if (response.result.orderRef !== caseId || !Array.isArray(response.result.taskRuns) || !Array.isArray(response.result.documents)) {
          setError(`${key}.unavailable`)
        } else {
          setLedger(response.result)
        }
      })
      .catch(() => { if (!cancelled) setError(`${key}.unavailable`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [caseId])

  React.useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setVersion(null)
    setVersionError(null)
    void apiCall<ResearchVersion>(`/api/agency_research/document-versions?id=${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result) {
          setVersionError(response.status === 403 ? `${key}.forbidden` : `${key}.versionUnavailable`)
        } else if (response.result.id !== selectedId || response.result.order_id !== caseId) {
          setVersionError(`${key}.versionUnavailable`)
        } else {
          setVersion(response.result)
        }
      })
      .catch(() => { if (!cancelled) setVersionError(`${key}.versionUnavailable`) })
    return () => { cancelled = true }
  }, [caseId, selectedId])

  const openVersion = React.useCallback((id: string) => {
    const belongs = ledger?.taskRuns.some((run) => run.outputVersionId === id)
      || ledger?.documents.some((document) => document.versionId === id)
    if (belongs) setSelectedId(id)
  }, [ledger])
  const columns = React.useMemo<ColumnDef<TaskRun>[]>(() => [
    { accessorKey: 'stepId', header: translate(`${key}.step`) },
    { accessorKey: 'attempt', header: translate(`${key}.attempt`) },
    { accessorKey: 'runner', header: translate(`${key}.runner`), meta: { maxWidth: '220px', truncate: true } },
    { accessorKey: 'status', header: translate(`${key}.status`), cell: ({ row }) => <StatusBadge variant="neutral">{row.original.status}</StatusBadge> },
    { accessorKey: 'costPln', header: translate(`${key}.cost`) },
    { accessorKey: 'error', header: translate('agencyOperations.cases.detail.run.error'), cell: ({ row }) => row.original.error ?? '—', meta: { maxWidth: '260px', truncate: true } },
    { accessorKey: 'outputVersionId', header: translate(`${key}.output`), cell: ({ row }) => row.original.outputVersionId ? (
      <Button type="button" variant="outline" onClick={() => openVersion(row.original.outputVersionId!)}>
        {row.original.outputVersionId}
      </Button>
    ) : '—' },
  ], [openVersion, translate])
  const documentColumns = React.useMemo<ColumnDef<ResearchDocument>[]>(() => [
    { accessorKey: 'templateId', header: translate(`${key}.document`) },
    { accessorKey: 'status', header: translate(`${key}.status`), cell: ({ row }) => <StatusBadge variant="neutral">{row.original.status}</StatusBadge> },
    { accessorKey: 'versionNo', header: translate('agencyOperations.cases.process.version') },
    { accessorKey: 'versionId', header: translate(`${key}.output`), cell: ({ row }) => row.original.versionId ? (
      <Button type="button" variant="outline" onClick={() => openVersion(row.original.versionId!)}>{row.original.versionId}</Button>
    ) : '—' },
  ], [openVersion, translate])

  if (loading) return <LoadingMessage label={translate(`${key}.loading`)} />
  if (error) return <ErrorMessage label={translate(error)} />
  if (!ledger) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{translate(`${key}.partialHint`)}</p>
      <p className="text-sm">{translate(`${key}.totalCost`)}: {ledger.totalPln}</p>
      <DataTable<TaskRun>
        columns={columns} data={ledger.taskRuns.slice((page - 1) * 20, page * 20)}
        emptyState={translate(`${key}.empty`)}
        pagination={{ page, pageSize: 20, total: ledger.taskRuns.length, totalPages: Math.max(1, Math.ceil(ledger.taskRuns.length / 20)), onPageChange: setPage }}
      />
      {ledger.documents.length ? <DataTable<ResearchDocument> title={translate(`${key}.documents`)} columns={documentColumns} data={ledger.documents} /> : null}
      {selectedId && version?.id !== selectedId && !versionError ? <LoadingMessage label={translate(`${key}.versionLoading`)} /> : null}
      {versionError ? <ErrorMessage label={translate(versionError)} /> : null}
      {version?.id === selectedId ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{translate(`${key}.noApproval`)}</p>
          <ResearchLineage key={version.id} caseId={caseId} initialVersion={version} />
        </div>
      ) : null}
    </div>
  )
}

export function AgencyCaseResearchLedger({ caseId }: { caseId: string }) {
  const translate = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const [revision, setRevision] = React.useState(0)
  return (
    <section className="space-y-4 rounded-lg border bg-card p-6">
      <SectionHeader title={translate(`${key}.title`)} action={(
        <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)}>
          {translate('agencyOperations.cases.detail.workflow.refresh')}
        </Button>
      )} />
      <LedgerRecords key={`${caseId}:${scopeVersion}:${revision}`} caseId={caseId} />
    </section>
  )
}
