'use client'

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { buildWorkInboxItemHref } from '@open-mercato/core/modules/workflows/lib/work-inbox/navigation'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import type { EmployeeQuestionItem, EmployeeQuestionList } from '../../../../../lib/employeeQuestions/contracts'

const key = 'agencyOperations.cases.employeeQuestions'
type Values = { parentTaskId: string; question: string; documentVersionId?: string }

export function AgencyCaseEmployeeQuestions({ caseId, updatedAt }: { caseId: string; updatedAt: string | null }) {
  const translate = useT()
  const [data, setData] = React.useState<EmployeeQuestionList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const [formRevision, setFormRevision] = React.useState(0)
  const eventId = React.useRef<string | null>(null)
  const endpoint = `/api/agency_operations/cases/${encodeURIComponent(caseId)}/questions`

  React.useEffect(() => {
    let cancelled = false
    eventId.current = null
    setData(null)
    setError(false)
    setLoading(true)
    void apiCall<EmployeeQuestionList>(endpoint).then((response) => {
      if (cancelled) return
      if (response.ok && response.result) setData(response.result)
      else setError(true)
    }).catch(() => { if (!cancelled) setError(true) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [endpoint, revision])

  const parents = data?.parents ?? []
  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'parentTaskId', type: 'select', label: translate(`${key}.parent`), required: true,
      options: parents.filter((parent) => parent.canAsk).map((parent) => ({ value: parent.taskId, label: parent.taskName })) },
    { id: 'question', type: 'textarea', label: translate(`${key}.question`), required: true, maxLength: 4000 },
    { id: 'documentVersionId', type: 'text', label: translate(`${key}.version`), description: translate(`${key}.versionHelp`) },
  ], [parents, translate])
  const initialValues = React.useMemo(() => ({ id: caseId, updatedAt, parentTaskId: '', question: '', documentVersionId: '' }), [caseId, updatedAt])
  const columns = React.useMemo<ColumnDef<EmployeeQuestionItem>[]>(() => [
    { accessorKey: 'question', header: translate(`${key}.question`), cell: ({ row }) => <p className="whitespace-pre-wrap">{row.original.question}</p> },
    { id: 'state', header: translate(`${key}.state`), cell: ({ row }) => <div className="space-y-1"><StatusBadge variant={row.original.workflowStatus === 'FAILED' ? 'error' : row.original.submissionId ? 'neutral' : 'warning'}>{row.original.workflowStatus} · {row.original.customerTaskStatus}</StatusBadge><p>{translate(`${key}.${row.original.submissionId ? 'received' : row.original.answer ? 'receiptPending' : 'waiting'}`)}</p></div> },
    { id: 'answer', header: translate(`${key}.answer`), cell: ({ row }) => <div className="space-y-1"><p className="whitespace-pre-wrap">{row.original.answer ?? translate(`${key}.noAnswer`)}</p><p className="break-all text-xs text-muted-foreground">{row.original.submissionId ?? ''}</p></div> },
    { id: 'context', header: translate(`${key}.context`), cell: ({ row }) => <div className="space-y-2">
      {row.original.documentVersionId ? <p className="break-all text-xs text-muted-foreground">{row.original.documentVersionId}</p> : null}
      <Button type="button" asChild variant="outline" size="sm"><Link href={buildWorkInboxItemHref(row.original.parentTaskId)}>{translate(`${key}.openException`)}</Link></Button>
      <Button type="button" asChild variant="outline" size="sm"><Link href={`/backend/instances/${encodeURIComponent(row.original.workflowInstanceId)}`}>{translate(`${key}.openQuestion`)}</Link></Button>
    </div> },
  ], [translate])

  async function submit(values: Values) {
    eventId.current ??= globalThis.crypto.randomUUID()
    await readApiResultOrThrow(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentTaskId: values.parentTaskId, question: values.question, eventId: eventId.current,
        ...(values.documentVersionId?.trim() ? { documentVersionId: values.documentVersionId.trim() } : {}),
      }),
    }, { errorMessage: translate(`${key}.sendError`) })
    flash(translate(`${key}.sent`), 'success')
    eventId.current = null
    setFormRevision((value) => value + 1)
    setRevision((value) => value + 1)
  }

  return <section className="space-y-4 rounded-lg border bg-card p-6">
    <SectionHeader title={translate(`${key}.title`)} action={<Button type="button" variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{translate('agencyOperations.cases.detail.workflow.refresh')}</Button>} />
    <p className="text-sm text-muted-foreground">{translate(`${key}.keepsBlocked`)}</p>
    {loading ? <LoadingMessage label={translate('agencyOperations.cases.detail.loading')} /> : null}
    {error ? <ErrorMessage label={translate(`${key}.loadError`)} /> : null}
    {data ? <>
      {!data.configured ? <p className="text-sm text-muted-foreground">{translate(`${key}.notConfigured`)}</p> : parents.some((parent) => parent.canAsk) ? <CrudForm<Values> key={`${caseId}:${formRevision}`} embedded fields={fields} initialValues={initialValues} onSubmit={submit} submitLabel={translate(`${key}.send`)} /> : <p className="text-sm text-muted-foreground">{translate(`${key}.noOwnedException`)}</p>}
      {parents.filter((parent) => !parent.canAsk && ['PENDING', 'IN_PROGRESS'].includes(parent.status)).map((parent) => <Button key={parent.taskId} type="button" asChild variant="outline" size="sm"><Link href={buildWorkInboxItemHref(parent.taskId)}>{parent.taskName}</Link></Button>)}
      <DataTable<EmployeeQuestionItem> columns={columns} data={data.questions} emptyState={translate(`${key}.empty`)} />
    </> : null}
  </section>
}
