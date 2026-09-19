'use client'

import * as React from 'react'
import Link from 'next/link'
import type { z } from 'zod'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import {
  salesQuestionListSchema, salesQuestionRequestSchema, salesQuestionResponseSchema,
  type SalesQuestionItem, type SalesQuestionRequest,
} from '@/modules/agency_operations/lib/salesQuestions/contracts'

const endpoint = '/api/agency/portal/questions'
const key = 'agency.salesQuestions'
const initialValues = { question: '' }
type QuestionList = z.infer<typeof salesQuestionListSchema>

export function SalesQuestions({ orgSlug }: { orgSlug: string }) {
  return <SalesQuestionsContent key={orgSlug} orgSlug={orgSlug} />
}

function SalesQuestionsContent({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const [result, setResult] = React.useState<QuestionList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)
  const [writeError, setWriteError] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [previous, setPrevious] = React.useState<SalesQuestionItem | null>(null)
  const [formVersion, setFormVersion] = React.useState(0)
  const generation = React.useRef(0)
  const inFlight = React.useRef(false)
  const attempts = React.useRef(new Map<string, string>())
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'agency-sales-question-retry' })

  const load = React.useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setLoadError(false)
    try {
      const response = await apiCall<unknown>(endpoint)
      if (current !== generation.current) return
      const parsed = salesQuestionListSchema.safeParse(response.result)
      if (!response.ok || !parsed.success) { setLoadError(true); return }
      setResult(parsed.data)
    } catch {
      if (current === generation.current) setLoadError(true)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    return () => { generation.current += 1 }
  }, [load])

  const fields = React.useMemo<CrudField[]>(() => [{
    id: 'question', type: 'textarea', label: t(`${key}.question`), required: true, rows: 4, maxLength: 4000,
  }], [t])

  async function persist(payload: SalesQuestionRequest) {
    const response = await apiCall<unknown>(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })
    const parsed = salesQuestionResponseSchema.safeParse(response.result)
    if (!response.ok || !parsed.success) throw createCrudFormError(t(`${key}.submitError`))
    generation.current += 1
    setLoading(false)
    setResult((current) => current ? { ...current,
      items: [parsed.data.item, ...current.items.filter((item) => item.id !== parsed.data.item.id)],
    } : current)
    return parsed.data.item
  }

  async function submit(values: Record<string, unknown>) {
    if (inFlight.current) throw createCrudFormError(t(`${key}.submitError`))
    const question = typeof values.question === 'string' ? values.question.trim() : ''
    const attemptKey = JSON.stringify([question, previous?.id])
    const eventId = attempts.current.get(attemptKey) ?? crypto.randomUUID()
    const parsed = salesQuestionRequestSchema.safeParse({ eventId, question, ...(previous ? { previousQuestionId: previous.id } : {}) })
    if (!parsed.success) throw createCrudFormError(t(`${key}.invalid`))
    attempts.current.set(attemptKey, eventId)
    inFlight.current = true
    setBusy(true)
    setWriteError(false)
    try {
      await persist(parsed.data)
      attempts.current.delete(attemptKey)
      setPrevious(null)
      setFormVersion((value) => value + 1)
    } catch {
      throw createCrudFormError(t(`${key}.submitError`))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function retry(item: SalesQuestionItem) {
    if (inFlight.current) return
    const payload = { eventId: item.eventId, question: item.question,
      ...(item.previousQuestionId ? { previousQuestionId: item.previousQuestionId } : {}) }
    inFlight.current = true
    setBusy(true)
    setWriteError(false)
    try {
      await runMutation({ operation: () => persist(payload), mutationPayload: payload,
        context: { questionId: item.id, retryLastMutation } })
    } catch { setWriteError(true) }
    finally { inFlight.current = false; setBusy(false) }
  }

  const columns: ColumnDef<SalesQuestionItem>[] = [
    { accessorKey: 'question', header: t(`${key}.question`), cell: ({ row }) => (
      <div className="space-y-2"><p className="whitespace-pre-wrap">{row.original.question}</p>
        <p className="text-xs text-muted-foreground">{row.original.catalogVersionId} · {row.original.createdAt}</p></div>
    ) },
    { id: 'answer', header: t(`${key}.answer`), cell: ({ row }) => {
      const item = row.original
      return <div className="space-y-3">
        <StatusBadge variant={item.state === 'answered' ? 'success' : item.state === 'attention_required' ? 'warning' : 'info'}>
          {t(`${key}.state.${item.state}`)}
        </StatusBadge>
        {item.answer ? <>
          <p className="text-sm font-medium">{t(`${key}.disposition.${item.answer.disposition}`)}</p>
          <p className="whitespace-pre-wrap">{item.answer.message}</p>
          {item.answer.supportingCatalogPassages.length ? <details><summary>{t(`${key}.sources`)}</summary>
            {item.answer.supportingCatalogPassages.map((passage, index) => <p className="whitespace-pre-wrap" key={index}>{passage}</p>)}
          </details> : null}
          {item.answer.unresolvedQuestions.length ? <div><p className="font-medium">{t(`${key}.unresolved`)}</p>
            {item.answer.unresolvedQuestions.map((question, index) => <p key={index}>{question}</p>)}
          </div> : null}
        </> : null}
        <div className="flex flex-wrap gap-2">
          {item.state === 'waiting_configuration' ? <Button type="button" variant="outline" disabled={busy}
            onClick={() => { void retry(item) }}>{t(`${key}.retry`)}</Button> : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => setPrevious(item)}>{t(`${key}.followUp`)}</Button>
        </div>
      </div>
    } },
  ]

  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <PortalPageHeader title={t(`${key}.title`)} description={t(`${key}.description`)} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={loading || busy} onClick={() => { void load() }}>{t(`${key}.refresh`)}</Button>
      <Button type="button" variant="outline" asChild><Link href={`/${orgSlug}/portal/agency`}>{t(`${key}.exit`)}</Link></Button>
      <Button type="button" variant="outline" asChild><Link href={`/${orgSlug}/portal/agency/order`}>{t(`${key}.purchase`)}</Link></Button>
    </div>
    {loadError ? <ErrorMessage label={t(`${key}.loadError`)} /> : null}
    {writeError ? <ErrorMessage label={t(`${key}.submitError`)} /> : null}
    {loading && !result ? <LoadingMessage label={t(`${key}.refresh`)} /> : null}
    {result ? <>
      <PortalCard><PortalCardHeader title={t(`${key}.offer`)} description={result.offer.versionId} />
        <p className="whitespace-pre-wrap text-sm">{result.offer.content}</p>
      </PortalCard>
      <PortalCard>
        {previous ? <div className="mb-4 space-y-2"><p>{t(`${key}.following`, { question: previous.question })}</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setPrevious(null)}>{t(`${key}.newQuestion`)}</Button>
        </div> : null}
        <CrudForm key={formVersion} formId="agency-sales-question" embedded disableInitialFocus
          fields={fields} initialValues={initialValues} onSubmit={submit} submitLabel={t(`${key}.submit`)} />
      </PortalCard>
      <DataTable<SalesQuestionItem> columns={columns} data={result.items} sortable={false}
        emptyState={t(`${key}.empty`)} />
    </> : null}
  </div>
}
