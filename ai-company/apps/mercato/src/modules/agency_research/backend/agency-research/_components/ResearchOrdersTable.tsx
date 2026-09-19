'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export type ResearchOrderRow = {
  orderRef: string
  brand: string
  documents: number
  taskRuns: number
  lastStep: string | null
  lastStatus: string | null
  totalPln: number
  firstRunAt: string | null
  lastActivityAt: string | null
}

const key = 'agencyResearch.orders'
export const ORDERS_PATH = '/backend/agency-research'

export function runStatusVariant(status: string | null): StatusBadgeVariant {
  if (!status) return 'neutral'
  if (status === 'done') return 'success'
  if (status === 'to_fix' || status === 'paused_budget' || status === 'running') return 'warning'
  if (status === 'failed' || status === 'exception') return 'error'
  return 'neutral'
}

export function formatDateTime(value: string | null, locale: string, emptyLabel: string): string {
  if (!value) return emptyLabel
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? emptyLabel : date.toLocaleString(locale || undefined)
}

export function ResearchOrdersTable() {
  const translate = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [rows, setRows] = React.useState<ResearchOrderRow[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const pageSize = 20

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    void apiCall<{ items: ResearchOrderRow[]; total: number }>('/api/agency_research/orders')
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result) {
          setError(response.status === 403 ? `${key}.forbidden` : `${key}.unavailable`)
        } else {
          setRows(Array.isArray(response.result.items) ? response.result.items : [])
        }
      })
      .catch(() => { if (!cancelled) setError(`${key}.unavailable`) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [scopeVersion])

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => row.orderRef.toLowerCase().includes(needle) || row.brand.toLowerCase().includes(needle))
  }, [rows, search])

  const columns = React.useMemo<ColumnDef<ResearchOrderRow>[]>(() => [
    { accessorKey: 'orderRef', header: translate(`${key}.columns.orderRef`), meta: { maxWidth: '260px', truncate: true } },
    { accessorKey: 'brand', header: translate(`${key}.columns.brand`) },
    { accessorKey: 'documents', header: translate(`${key}.columns.documents`) },
    { accessorKey: 'taskRuns', header: translate(`${key}.columns.taskRuns`) },
    {
      accessorKey: 'lastStep',
      header: translate(`${key}.columns.lastStep`),
      cell: ({ row }) => row.original.lastStep ? (
        <span className="inline-flex items-center gap-2">
          <span>{row.original.lastStep}</span>
          <StatusBadge variant={runStatusVariant(row.original.lastStatus)}>{row.original.lastStatus ?? '—'}</StatusBadge>
        </span>
      ) : '—',
    },
    { accessorKey: 'totalPln', header: translate(`${key}.columns.totalPln`), cell: ({ row }) => row.original.totalPln.toFixed(2) },
    { accessorKey: 'lastActivityAt', header: translate(`${key}.columns.lastActivityAt`), cell: ({ row }) => formatDateTime(row.original.lastActivityAt, locale, '—') },
  ], [locale, translate])

  if (isLoading) return <LoadingMessage label={translate(`${key}.loading`)} />
  if (error) return <ErrorMessage label={translate(error)} />

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{translate(`${key}.list.hint`)}</p>
      <DataTable<ResearchOrderRow>
        title={translate(`${key}.list.title`)}
        columns={columns}
        data={filtered.slice((page - 1) * pageSize, page * pageSize)}
        searchValue={search}
        onSearchChange={(value) => { setSearch(value); setPage(1) }}
        emptyState={translate(`${key}.empty`)}
        onRowClick={(row) => router.push(`${ORDERS_PATH}/${encodeURIComponent(row.orderRef)}`)}
        pagination={{ page, pageSize, total: filtered.length, totalPages, onPageChange: setPage }}
      />
    </div>
  )
}
