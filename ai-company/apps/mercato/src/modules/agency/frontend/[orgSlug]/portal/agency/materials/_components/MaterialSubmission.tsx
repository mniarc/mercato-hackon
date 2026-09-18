'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Input } from '@open-mercato/ui/primitives/input'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type SubmittedMaterial = { caseId: string; workflowInstanceId: string; status: 'COMPLETED' }

export default function MaterialSubmission({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const [submitted, setSubmitted] = React.useState<SubmittedMaterial | null>(null)
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
      id: 'file', type: 'custom', label: t('agency.materials.file'), required: true,
      component: ({ id, setValue, disabled }) => (
        <Input id={id} type="file" disabled={disabled} aria-label={t('agency.materials.file')}
          onChange={(event) => setValue(event.target.files?.[0] ?? null)} />
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
    const result = await readApiResultOrThrow<SubmittedMaterial>('/api/agency/portal/materials', {
      method: 'POST', body,
    })
    setSubmitted(result)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader title={t('agency.materials.title')} description={t('agency.materials.description')} />
      <PortalCard>
        {submitted ? (
          <div role="status" className="space-y-2">
            <p>{t('agency.materials.success')}</p>
            <p>{t('agency.materials.caseId')}: <span data-testid="agency-material-case-id">{submitted.caseId}</span></p>
          </div>
        ) : (
          <CrudForm fields={fields} onSubmit={submit} submitLabel={t('agency.materials.submit')}
            cancelHref={`/${orgSlug}/portal/agency`} embedded formId="agency-material-submission" />
        )}
      </PortalCard>
    </div>
  )
}
