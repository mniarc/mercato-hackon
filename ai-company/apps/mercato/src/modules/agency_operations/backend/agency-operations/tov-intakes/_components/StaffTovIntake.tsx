'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import type { StaffTovIntakeStatus } from '../../../../lib/tovIntake/contracts'

type CaseRow = { id: string; title: string; customerEntityId: string }
type CaseList = { items: CaseRow[] }

export function StaffTovIntake() {
  const t = useT()
  const requestedCaseId = useSearchParams()?.get('caseId') ?? ''
  const [cases, setCases] = React.useState<CaseRow[]>([])
  const [ready, setReady] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [result, setResult] = React.useState<StaffTovIntakeStatus | null>(null)
  const eventId = React.useRef<string | null>(null)

  React.useEffect(() => {
    let active = true
    setReady(false)
    setLoadFailed(false)
    setCases([])
    setResult(null)
    eventId.current = null
    async function loadCases() {
      const value = await readApiResultOrThrow<CaseList>('/api/agency_operations/cases?pageSize=100')
      if (requestedCaseId && !value.items.some((item) => item.id === requestedCaseId)) {
        const selected = await readApiResultOrThrow<CaseList>(`/api/agency_operations/cases?id=${encodeURIComponent(requestedCaseId)}&pageSize=1`)
        value.items = [...selected.items.filter((item) => item.id === requestedCaseId), ...value.items]
      }
      if (active) setCases(value.items)
    }
    loadCases()
      .catch(() => { if (active) setLoadFailed(true) })
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [requestedCaseId])

  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'caseId', type: 'select', required: true,
      label: t('agencyOperations.tovIntake.case', 'Opłacona sprawa agencyjna'),
      options: cases.map((item) => ({ value: item.id, label: `${item.title} (${item.id})` })) },
    { id: 'brand', type: 'text', required: true,
      label: t('agencyOperations.tovIntake.brand', 'Marka') },
    { id: 'outputLanguage', type: 'select', required: true,
      label: t('agencyOperations.tovIntake.language', 'Język opracowania'),
      options: [{ value: 'pl', label: 'Polski' }, { value: 'en', label: 'English' }] },
    { id: 'file', type: 'custom', required: true,
      label: t('agencyOperations.tovIntake.file', 'Znormalizowany korpus publicznych postów (JSON)'),
      component: ({ id, setValue, disabled }) => <div className="space-y-2">
        <Label htmlFor={id}>{t('agencyOperations.tovIntake.file', 'Znormalizowany korpus publicznych postów (JSON)')}</Label>
        <Input id={id} type="file" accept="application/json,.json" disabled={disabled}
          onChange={(event) => setValue(event.target.files?.[0] ?? null)} />
      </div> },
  ], [cases, t])

  async function submit(values: Record<string, unknown>) {
    if (typeof values.caseId !== 'string' || !cases.some((item) => item.id === values.caseId)
      || typeof values.brand !== 'string' || !['pl', 'en'].includes(String(values.outputLanguage))
      || !(values.file instanceof File)) {
      throw createCrudFormError(t('agencyOperations.tovIntake.invalid', 'Uzupełnij sprawę, markę, język i prawidłowy plik JSON.'))
    }
    eventId.current ??= crypto.randomUUID()
    const body = new FormData()
    body.set('caseId', values.caseId)
    body.set('eventId', eventId.current)
    body.set('brand', values.brand)
    body.set('outputLanguage', String(values.outputLanguage))
    body.set('file', values.file)
    setResult(await readApiResultOrThrow<StaffTovIntakeStatus>('/api/agency_operations/tov-intakes', { method: 'POST', body }))
  }

  async function refresh() {
    if (!result) return
    setResult(await readApiResultOrThrow<StaffTovIntakeStatus>(`/api/agency_operations/tov-intakes/${encodeURIComponent(result.workflowInstanceId)}`))
  }

  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <Button type="button" asChild variant="outline"><Link href={result?.caseId
      ? `/backend/agency-operations/cases/${encodeURIComponent(result.caseId)}`
      : requestedCaseId && cases.some((item) => item.id === requestedCaseId)
        ? `/backend/agency-operations/cases/${encodeURIComponent(requestedCaseId)}`
        : '/backend/agency-operations/cases'}>{t(result?.caseId || cases.some((item) => item.id === requestedCaseId)
          ? 'agencyOperations.journey.openCase' : 'agencyOperations.cases.detail.backToList')}</Link></Button>
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{t('agencyOperations.tovIntake.title', 'Uruchom badanie tonu komunikacji')}</h1>
      <p className="text-sm text-muted-foreground">{t('agencyOperations.tovIntake.description',
        'Jawna akcja pracownika dla istniejącej opłaconej sprawy. Plik musi zawierać 1–100 znormalizowanych publicznych postów. Nie uruchamia wyszukiwania ani publikacji.')}</p>
    </div>
    {result ? <div className="space-y-3 rounded-md border p-4" role="status">
      <p>{t(`agencyOperations.tovIntake.state.${result.state}`, result.state)}</p>
      <dl className="grid gap-2 text-sm">
        <div><dt className="font-medium">{t('agencyOperations.tovIntake.workflow', 'Workflow')}</dt><dd className="break-all">{result.workflowInstanceId}</dd></div>
        <div><dt className="font-medium">{t('agencyOperations.tovIntake.workflowStatus', 'Status')}</dt><dd>{result.workflowStatus}</dd></div>
        {result.result ? <div><dt className="font-medium">{t('agencyOperations.tovIntake.researchRun', 'Research run')}</dt><dd className="break-all">{result.result.researchRunId}</dd></div> : null}
      </dl>
      <p className="text-sm text-muted-foreground">
        {t('agencyOperations.tovIntake.statusHint', 'This status covers the specialist ToV workflow only. Strategy continuation is tracked separately.')}
      </p>
      <Button type="button" variant="outline" onClick={() => void refresh()}>{t('agencyOperations.tovIntake.refresh', 'Odśwież status')}</Button>
    </div> : !ready ? <p>{t('agencyOperations.tovIntake.loading', 'Ładowanie spraw…')}</p>
      : loadFailed ? <p role="alert">{t('agencyOperations.tovIntake.loadFailed', 'Nie udało się wczytać spraw.')}</p>
      : !cases.length ? <p>{t('agencyOperations.tovIntake.noCases', 'Brak dostępnych spraw.')}</p>
      : <CrudForm key={requestedCaseId} fields={fields} initialValues={{ caseId: cases.some((item) => item.id === requestedCaseId) ? requestedCaseId : '', brand: '', outputLanguage: 'pl' }} onSubmit={submit}
        submitLabel={t('agencyOperations.tovIntake.submit', 'Uruchom specjalistę ToV')} />}
  </div>
}
