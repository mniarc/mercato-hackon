'use client'

import * as React from 'react'
import Link from 'next/link'
import type { z } from 'zod'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'
import {
  publicationConsentReadSchema, publicationConsentResponseReceiptSchema, publicationConsentResponseSchema,
} from '@/modules/agency_operations/lib/publicationConsentRequest/contracts'

type Props = { taskId: string; orgSlug: string; canComplete: boolean; taskStatus: string; updatedAt?: string }
type Projection = z.infer<typeof publicationConsentReadSchema>
const key = 'agency.postReview'
const initialValues = { consent: false }

export function PublicationConsent(props: Props) {
  return <PublicationConsentLoader key={`${props.orgSlug}:${props.taskId}`} {...props} />
}

function PublicationConsentLoader({ taskId, orgSlug, canComplete, taskStatus, updatedAt }: Props) {
  const t = useT()
  const [projection, setProjection] = React.useState<Projection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [failure, setFailure] = React.useState<string | null>(null)
  const generation = React.useRef(0)
  const currentRequest = React.useRef('')
  const inFlight = React.useRef(false)
  const attempts = React.useRef(new Map<string, string>())
  const endpoint = `/api/agency/publication-consents/${encodeURIComponent(taskId)}`

  const load = React.useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setFailure(null)
    try {
      const response = await apiCall<unknown>(endpoint)
      if (current !== generation.current) return
      const parsed = publicationConsentReadSchema.safeParse(response.result)
      if (!response.ok || !parsed.success) {
        setProjection(null)
        setFailure(response.status === 404 ? 'agency.review.notFound' : 'agency.review.loadError')
        return
      }
      setProjection(parsed.data)
    } catch {
      if (current === generation.current) {
        setProjection(null)
        setFailure('agency.review.loadError')
      }
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [endpoint])

  React.useEffect(() => {
    void load()
    return () => { generation.current += 1 }
  }, [load, updatedAt])
  usePortalAppEvent('agency.*', () => { void load() }, [load])

  const requestKey = projection ? JSON.stringify([
    projection.request.documentId, projection.request.postVersionId,
    projection.request.contentHash, projection.request.target.configVersionId,
  ]) : ''
  currentRequest.current = requestKey
  const available = Boolean(projection?.canRespond && canComplete && ['PENDING', 'IN_PROGRESS'].includes(taskStatus)
    && projection.consentedAt === null && !loading && !failure)
  const target = projection ? [projection.request.target.displayName, projection.request.target.platform,
    projection.request.target.accountId, projection.request.target.channelId].filter(Boolean).join(' · ') : ''
  const fields = React.useMemo<CrudField[]>(() => [{
    id: 'consent', type: 'checkbox', required: true,
    label: t(`${key}.publicationConsent`, { target }), description: t(`${key}.publicationConsentHint`),
  }], [t, target])

  async function respond(values: Record<string, unknown>) {
    if (!projection || !available || inFlight.current || values.consent !== true) {
      throw createCrudFormError(t(`${key}.publicationConsentHint`))
    }
    const externalEventId = attempts.current.get(requestKey) ?? crypto.randomUUID()
    attempts.current.set(requestKey, externalEventId)
    const payload = publicationConsentResponseSchema.parse({
      postVersionId: projection.request.postVersionId,
      configVersionId: projection.request.target.configVersionId,
      consent: true,
      externalEventId,
    })
    inFlight.current = true
    try {
      const response = await apiCall<unknown>(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const receipt = publicationConsentResponseReceiptSchema.safeParse(response.result)
      if (!response.ok || !receipt.success || receipt.data.taskId !== taskId || receipt.data.canSend !== false) {
        if ([403, 404, 409].includes(response.status)) void load()
        throw new Error('[internal] Publication consent was not acknowledged')
      }
      if (currentRequest.current === requestKey) {
        setProjection((current) => current ? { ...current, canRespond: false, canSend: false, consentedAt: receipt.data.consentedAt } : current)
      }
    } catch {
      throw createCrudFormError(t('agency.review.submitError'))
    } finally {
      inFlight.current = false
    }
  }

  const back = <Button type="button" variant="outline" asChild><Link href={`/${orgSlug}/portal/tasks`}>{t('agency.review.back')}</Link></Button>
  if (failure) return <div className="space-y-4"><ErrorMessage label={t(failure)} /><Button type="button" variant="outline" onClick={() => { void load() }}>{t('agency.review.retry')}</Button>{back}</div>
  if (loading || !projection) return <LoadingMessage label={t('agency.review.loading')} />

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PortalPageHeader title={t(`${key}.title`)} description={t('agency.review.publicationHint')} action={back} />
      <PortalCard>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t('agency.review.version', { version: projection.request.version })}</h2>
            <p className="text-sm text-muted-foreground">{t(`${key}.publicationConsent`, { target })}</p>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-4 font-sans text-sm">{projection.request.clientViewMd}</pre>
        </div>
      </PortalCard>
      <Alert status="information"><AlertDescription>{t(`${key}.publicationConsentHint`)}</AlertDescription></Alert>
      <PortalCard>
        {projection.consentedAt ? <Alert status="success"><AlertDescription>
          {t(`${key}.publicationConsentSaved`, { time: projection.consentedAt })}
        </AlertDescription></Alert>
          : available ? <CrudForm key={requestKey} formId={`agency-publication-consent-${taskId}`} embedded disableInitialFocus
            fields={fields} initialValues={initialValues} onSubmit={respond} submitLabel={t(`${key}.send`)} />
            : <Alert status="information"><AlertDescription>{t('agency.review.readOnly')}</AlertDescription></Alert>}
      </PortalCard>
    </div>
  )
}
