'use client'

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ClientCaseItem, ClientCaseListResult } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'

export function ClientCases({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const [result, setResult] = React.useState<ClientCaseListResult | null>(null)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setResult(null)
    apiCall<ClientCaseListResult>(`/api/agency/portal/cases?page=${page}&pageSize=20`)
      .then((response) => {
        if (cancelled) return
        if (response.ok && response.result) setResult(response.result)
        else setError(true)
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgSlug, page, refresh])

  const caseHref = React.useCallback((caseId: string) => `/${orgSlug}/portal/agency/cases/${encodeURIComponent(caseId)}`, [orgSlug])
  const columns = React.useMemo<ColumnDef<ClientCaseItem>[]>(() => [
    {
      accessorKey: 'title', header: t('agency.materials.caseTitle'),
      cell: ({ row }) => <Link href={caseHref(row.original.caseId)} className="font-medium hover:underline">{row.original.title}</Link>,
      meta: { maxWidth: '260px', truncate: true },
    },
    {
      accessorKey: 'materialFileName', header: t('agency.materials.file'),
      meta: { maxWidth: '220px', truncate: true },
    },
    {
      id: 'status', header: t('agency.materials.currentStatus'),
      cell: ({ row }) => t(`agency.materials.status.${row.original.workflow?.status ?? 'UNAVAILABLE'}`),
    },
  ], [caseHref, t])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PortalPageHeader title={t('agency.cases.title')} action={(
        <Button type="button" asChild variant="outline">
          <Link href={`/${orgSlug}/portal/agency/materials`}>{t('agency.materials.link')}</Link>
        </Button>
      )} />
      <DataTable<ClientCaseItem>
        columns={columns} data={result?.items ?? []} sortable={false}
        isLoading={loading} error={error ? t('agency.cases.loadError') : null}
        emptyState={t('agency.cases.empty')}
        actions={<Button type="button" variant="outline" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>{t('agency.materials.refreshStatus')}</Button>}
        rowActions={(row) => <RowActions items={[{ id: 'open', label: t('agency.cases.open'), href: caseHref(row.caseId) }]} />}
        pagination={{ page, pageSize: 20, total: result?.total ?? 0, totalPages: result?.totalPages ?? 0, onPageChange: setPage }}
      />
    </div>
  )
}
