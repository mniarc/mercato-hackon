'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SortingState } from '@tanstack/react-table'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { ListEmptyState } from '@open-mercato/ui/backend/filters/ListEmptyState'
import { loadAgencyCases, type AgencyCaseRow } from '../_lib/caseViewModel'

const CASES_PATH = '/backend/agency-operations/cases'

function formatDateTime(value: string | null, locale: string, emptyLabel: string): string {
  if (!value) return emptyLabel
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? emptyLabel : date.toLocaleString(locale || undefined)
}

export function AgencyCasesTable() {
  const translate = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [rows, setRows] = React.useState<AgencyCaseRow[]>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [totalIsCapped, setTotalIsCapped] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const sortField = sorting[0]?.id
  const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined

  React.useEffect(() => {
    let cancelled = false

    async function loadRows() {
      setIsLoading(true)
      setError(null)
      try {
        const result = await loadAgencyCases({
          page,
          pageSize,
          search,
          sortField,
          sortDir,
        })
        if (cancelled) return
        setRows(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setTotalIsCapped(result.totalIsCapped)
      } catch {
        if (!cancelled) setError(translate('agencyOperations.cases.list.loadError'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadRows()
    return () => {
      cancelled = true
    }
  }, [page, pageSize, scopeVersion, search, sortDir, sortField, translate])

  const columns = React.useMemo<ColumnDef<AgencyCaseRow>[]>(() => [
    {
      accessorKey: 'title',
      header: translate('agencyOperations.cases.list.columns.title'),
      cell: ({ row }) => (
        <Link
          href={`${CASES_PATH}/${row.original.id}`}
          className="font-medium text-foreground hover:underline"
        >
          {row.original.title}
        </Link>
      ),
      meta: { maxWidth: '260px', truncate: true },
    },
    {
      accessorKey: 'customerEntityId',
      header: translate('agencyOperations.cases.list.columns.client'),
      enableSorting: false,
      meta: { maxWidth: '220px', truncate: true },
    },
    {
      accessorKey: 'materialFileName',
      header: translate('agencyOperations.cases.list.columns.material'),
      cell: ({ row }) => row.original.materialFileName
        ?? translate('agencyOperations.cases.common.notAvailable'),
      enableSorting: false,
      meta: { maxWidth: '220px', truncate: true },
    },
    {
      accessorKey: 'agentWorkerId',
      header: translate('agencyOperations.cases.list.columns.worker'),
      enableSorting: false,
      meta: { maxWidth: '260px', truncate: true },
    },
    {
      accessorKey: 'createdAt',
      header: translate('agencyOperations.cases.list.columns.createdAt'),
      cell: ({ row }) => formatDateTime(
        row.original.createdAt,
        locale,
        translate('agencyOperations.cases.common.notAvailable'),
      ),
    },
  ], [locale, translate])

  return (
    <DataTable<AgencyCaseRow>
      title={translate('agencyOperations.cases.list.title')}
      titleHeadingLevel={1}
      columns={columns}
      data={rows}
      searchValue={search}
      onSearchChange={(nextSearch) => {
        setSearch(nextSearch)
        setPage(1)
      }}
      searchPlaceholder={translate('agencyOperations.cases.list.searchPlaceholder')}
      rowActions={(row) => (
        <RowActions
          items={[{
            id: 'open',
            label: translate('agencyOperations.cases.actions.open'),
            href: `${CASES_PATH}/${row.id}`,
          }]}
        />
      )}
      onRowClick={(row) => router.push(`${CASES_PATH}/${row.id}`)}
      rowClickActionIds={['open']}
      emptyState={(
        <ListEmptyState entityName={translate('agencyOperations.cases.list.entityName')} />
      )}
      error={error}
      isLoading={isLoading}
      sortable
      manualSorting
      sorting={sorting}
      onSortingChange={(nextSorting) => {
        setSorting(nextSorting)
        setPage(1)
      }}
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        totalIsCapped,
        onPageChange: setPage,
        pageSizeOptions: [20, 50, 100],
        onPageSizeChange: (nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(1)
        },
      }}
      extensionTableId="agency_operations.cases.list"
      stickyActionsColumn
    />
  )
}
