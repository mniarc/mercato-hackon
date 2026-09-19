'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import type { ClientCaseItem, ClientCaseListResult, SupplementaryMaterialResult } from '@/modules/agency_operations/lib/contracts'

export default function MaterialSubmission({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const requestedCaseId = useSearchParams()?.get('caseId') ?? ''
  const [cases, setCases] = React.useState<ClientCaseItem[]>([])
  const [ready, setReady] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [submitted, setSubmitted] = React.useState<SupplementaryMaterialResult | null>(null)
  const eventId = React.useRef<string | null>(null)
  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await readApiResultOrThrow<ClientCaseListResult>('/api/agency/portal/cases?pageSize=100')
        let items = result.items
        if (requestedCaseId && !items.some((item) => item.caseId === requestedCaseId)) {
          const item = await readApiResultOrThrow<ClientCaseItem>(`/api/agency/portal/cases/${encodeURIComponent(requestedCaseId)}`)
          items = [item, ...items]
        }
        if (active) setCases(items)
      } catch { if (active) setLoadFailed(true) }
      finally { if (active) setReady(true) }
    }
    void load()
    return () => { active = false }
  }, [requestedCaseId])
  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'caseId', type: 'select', label: t('agency.materials.supplement.case'), required: true,
      options: cases.map((item) => ({ value: item.caseId, label: item.title })) },
    { id: 'text', type: 'custom', label: '',
      component: ({ id, value, setValue, disabled, autoFocus }) => <div className="space-y-2">
        <Label htmlFor={id}>{t('agency.materials.supplement.message')}</Label>
        <Textarea id={id} value={typeof value === 'string' ? value : ''} disabled={disabled} autoFocus={autoFocus}
          onChange={(event) => setValue(event.target.value)} />
      </div> },
    { id: 'file', type: 'custom', label: t('agency.materials.file'), required: true,
      component: ({ id, setValue, disabled }) => <Input id={id} type="file" disabled={disabled}
        aria-label={t('agency.materials.file')} onChange={(event) => setValue(event.target.files?.[0] ?? null)} /> },
  ], [cases, t])
  async function submit(values: Record<string, unknown>) {
    if (typeof values.caseId !== 'string' || !cases.some((item) => item.caseId === values.caseId) || !(values.file instanceof File)) {
      throw createCrudFormError(t('agency.materials.supplement.invalid'))
    }
    eventId.current ??= crypto.randomUUID()
    const body = new FormData()
    body.set('caseId', values.caseId)
    body.set('eventId', eventId.current)
    if (typeof values.text === 'string') body.set('text', values.text)
    body.set('file', values.file)
    setSubmitted(await readApiResultOrThrow<SupplementaryMaterialResult>('/api/agency/portal/materials', { method: 'POST', body }))
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-material-form-ready={ready ? '1' : '0'}>
      <PortalPageHeader title={t('agency.materials.title')} description={t('agency.materials.supplement.description')} />
      <PortalCard>
        {submitted ? <div className="space-y-3" role="status">
          <p>{t(`agency.materials.supplement.${submitted.state}`)}</p>
          <span data-testid="agency-material-case-id">{submitted.caseId}</span>
          <Link className="block underline" href={`/${orgSlug}/portal/agency/cases/${submitted.caseId}`}>{t('agency.cases.open')}</Link>
        </div> : !ready ? <p>{t('agency.materials.supplement.loading')}</p>
          : loadFailed ? <p role="alert">{t('agency.materials.supplement.loadFailed')}</p>
          : !cases.length ? <div className="space-y-3"><p>{t('agency.materials.supplement.noCases')}</p>
            <Link className="underline" href={`/${orgSlug}/portal/agency/cases`}>{t('agency.materials.supplement.openCases')}</Link></div>
          : <CrudForm fields={fields} initialValues={{ caseId: cases.some((item) => item.caseId === requestedCaseId) ? requestedCaseId : '', text: '' }}
            onSubmit={submit} submitLabel={t('agency.materials.submit')} />}
      </PortalCard>
    </div>
  )
}
