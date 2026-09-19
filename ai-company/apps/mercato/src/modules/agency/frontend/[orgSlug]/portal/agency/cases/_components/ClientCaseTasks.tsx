'use client'

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { clientCaseTasksSchema, type ClientCaseTasks as Projection } from '@/modules/agency_operations/lib/clientCaseTasks/contracts'

type Task = Projection['tasks'][number]

export function ClientCaseTasks({ caseId, orgSlug }: { caseId: string; orgSlug: string }) {
  const t = useT()
  const [result, setResult] = React.useState<Projection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setResult(null)
    apiCall<unknown>(`/api/agency/portal/cases/${encodeURIComponent(caseId)}/tasks`)
      .then((response) => {
        if (cancelled) return
        const parsed = clientCaseTasksSchema.safeParse(response.result)
        if (response.ok && parsed.success && parsed.data.caseId === caseId) setResult(parsed.data)
        else setError(true)
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [caseId, orgSlug, refresh])
  usePortalAppEvent('agency.*', () => setRefresh((value) => value + 1), [])
  usePortalAppEvent('workflows.task.*', () => setRefresh((value) => value + 1), [])

  const columns = React.useMemo<ColumnDef<Task>[]>(() => [
    { accessorKey: 'title', header: t('agency.caseTasks.task'),
      cell: ({ row }) => <Link className="font-medium hover:underline" href={`/${encodeURIComponent(orgSlug)}/portal/tasks/${encodeURIComponent(row.original.id)}`}>{row.original.title}</Link> },
    { accessorKey: 'status', header: t('agency.materials.currentStatus'),
      cell: ({ row }) => t(`agency.caseTasks.status.${row.original.status}`) },
    { accessorKey: 'assignedToYou', header: t('agency.caseTasks.assignment'),
      cell: ({ row }) => t(row.original.assignedToYou ? 'agency.caseTasks.yours' : 'agency.caseTasks.company') },
  ], [orgSlug, t])

  return (
    <PortalCard>
      <h2 className="mb-4 text-lg font-semibold">{t('agency.caseTasks.title')}</h2>
      <DataTable<Task>
        columns={columns} data={result?.caseId === caseId ? result.tasks : []} sortable={false}
        isLoading={loading} error={error ? t('agency.caseTasks.loadError') : null}
        emptyState={t('agency.caseTasks.empty')}
        actions={<Button type="button" variant="outline" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>{t('agency.materials.refreshStatus')}</Button>}
      />
    </PortalCard>
  )
}
