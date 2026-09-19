'use client'

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Input } from '@open-mercato/ui/primitives/input'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import type { ClientMaterialIntakeResult } from '@/modules/agency_operations/lib/contracts'
import { CaseStatus } from './CaseStatus'

const initialValues = { processKind: 'intake', outputLanguage: 'en' }

export default function MaterialSubmission({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const [ready, setReady] = React.useState(false)
  const [submitted, setSubmitted] = React.useState<ClientMaterialIntakeResult | null>(null)
  React.useEffect(() => { setReady(true) }, [])
  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'title', type: 'custom', label: t('agency.materials.caseTitle'), required: true,
      component: ({ id, value, setValue, disabled }) => (
        <Input id={id} value={typeof value === 'string' ? value : ''} disabled={disabled}
          aria-label={t('agency.materials.caseTitle')} maxLength={200} required
          onChange={(event) => setValue(event.target.value)} />
      ),
    },
    {
      id: 'processKind', type: 'select', label: t('agency.materials.process'), required: true,
      options: [
        { value: 'intake', label: t('agency.materials.process.intake') },
        { value: 'tone_of_voice', label: t('agency.materials.process.tov') },
        { value: 'analysis', label: t('agency.materials.process.analysis') },
      ],
      description: t('agency.materials.processHint'),
    },
    {
      id: 'brand', type: 'custom', label: t('agency.materials.brand'), required: true,
      visibleWhen: { field: 'processKind', equals: 'tone_of_voice' },
      component: ({ id, value, setValue, disabled }) => (
        <Input id={id} value={typeof value === 'string' ? value : ''} disabled={disabled}
          aria-label={t('agency.materials.brand')} maxLength={200} required
          onChange={(event) => setValue(event.target.value)} />
      ),
    },
    {
      id: 'outputLanguage', type: 'select', label: t('agency.materials.outputLanguage'), required: true,
      visibleWhen: { field: 'processKind', equals: 'tone_of_voice' },
      options: [
        { value: 'en', label: t('agency.materials.language.en') },
        { value: 'pl', label: t('agency.materials.language.pl') },
      ],
      description: t('agency.materials.corpusHint'),
    },
    {
      id: 'file', type: 'custom', label: t('agency.materials.file'), required: true,
      component: ({ id, setValue, disabled, values }) => (
        <>
          <Input id={id} type="file" disabled={disabled} aria-label={t('agency.materials.file')}
            aria-describedby={values?.processKind === 'analysis' ? `${id}-analysis-hint` : undefined}
            onChange={(event) => setValue(event.target.files?.[0] ?? null)} />
          {values?.processKind === 'analysis' ? (
            <p id={`${id}-analysis-hint`} className="text-sm text-muted-foreground">{t('agency.materials.analysisHint')}</p>
          ) : null}
        </>
      ),
    },
  ], [t])

  async function submit(values: Record<string, unknown>) {
    if (typeof values.title !== 'string' || !values.title.trim() || !(values.file instanceof File)) {
      throw createCrudFormError(t('agency.materials.invalid'))
    }
    const body = new FormData()
    body.set('title', values.title)
    body.set('file', values.file)
    if (values.processKind === 'tone_of_voice') {
      if (typeof values.brand !== 'string' || !values.brand.trim()
        || (values.outputLanguage !== 'en' && values.outputLanguage !== 'pl')) {
        throw createCrudFormError(t('agency.materials.invalidProcess'))
      }
      body.set('process', JSON.stringify({
        kind: 'tone_of_voice', brand: values.brand, outputLanguage: values.outputLanguage,
      }))
    } else if (values.processKind === 'analysis') {
      body.set('process', JSON.stringify({ kind: 'analysis' }))
    }
    const result = await readApiResultOrThrow<ClientMaterialIntakeResult>('/api/agency/portal/materials', {
      method: 'POST', body,
    })
    setSubmitted(result)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-material-form-ready={ready ? '1' : '0'}>
      <PortalPageHeader title={t('agency.materials.title')} description={t('agency.materials.description')} />
      <PortalCard>
        {submitted ? (
          <div className="space-y-3">
            <p>{t('agency.materials.caseId')}: <span data-testid="agency-material-case-id">{submitted.caseId}</span></p>
            <CaseStatus caseId={submitted.caseId} />
            <Button type="button" asChild variant="outline">
              <Link href={`/${orgSlug}/portal/agency/cases/${encodeURIComponent(submitted.caseId)}`}>{t('agency.cases.open')}</Link>
            </Button>
          </div>
        ) : (
          <CrudForm fields={fields} initialValues={initialValues} onSubmit={submit} submitLabel={t('agency.materials.submit')}
            cancelHref={`/${orgSlug}/portal/agency`} embedded formId="agency-material-submission" isLoading={!ready} />
        )}
      </PortalCard>
    </div>
  )
}
