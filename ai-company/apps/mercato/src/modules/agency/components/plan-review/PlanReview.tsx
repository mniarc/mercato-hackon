'use client'

import * as React from 'react'
import Link from 'next/link'
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
import { DocumentReview } from '../DocumentReview'
import {
  buildPlanReviewRequest, canRespondToPlan, planReviewKey,
  planReviewProjectionSchema, type PlanReviewProjection,
} from './contract'

type Props = { taskId: string; orgSlug: string; canComplete: boolean; taskStatus: string; updatedAt?: string }
const key = 'agency.planReview'
const readOnlyResponse = async () => false
const initialValues = { kind: 'approval', approvePlan: false, selectedTopicId: '', body: '' }

export function PlanReview(props: Props) {
  return <PlanReviewLoader key={`${props.orgSlug}:${props.taskId}`} {...props} />
}

function PlanReviewLoader({ taskId, orgSlug, canComplete, taskStatus, updatedAt }: Props) {
  const t = useT()
  const [projection, setProjection] = React.useState<PlanReviewProjection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [submittedPlan, setSubmittedPlan] = React.useState<string | null>(null)
  const generation = React.useRef(0)
  const currentPlan = React.useRef('')
  const inFlight = React.useRef(false)
  const attempts = React.useRef(new Map<string, string>())
  const endpoint = `/api/agency/plan-reviews/${encodeURIComponent(taskId)}`

  const load = React.useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setFailure(null)
    setProjection(null)
    try {
      const response = await apiCall<unknown>(endpoint)
      if (current !== generation.current) return
      const parsed = planReviewProjectionSchema.safeParse(response.result)
      if (!response.ok || !parsed.success) {
        setFailure(response.status === 404 ? 'agency.review.notFound' : 'agency.review.loadError')
        return
      }
      setProjection(parsed.data)
    } catch {
      if (current === generation.current) setFailure('agency.review.loadError')
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [endpoint])

  React.useEffect(() => {
    void load()
    return () => { generation.current += 1 }
  }, [load, updatedAt])
  usePortalAppEvent('agency.*', () => { void load() }, [load])

  const planKey = projection ? planReviewKey(projection.review) : ''
  currentPlan.current = planKey
  const submitted = Boolean(planKey && submittedPlan === planKey)
  const available = Boolean(projection?.canRespond && canComplete && ['PENDING', 'IN_PROGRESS'].includes(taskStatus)
    && canRespondToPlan(projection.review) && !submitted && !loading && !failure)
  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'kind', type: 'select', label: t(`${key}.responseKind`), required: true,
      description: t(`${key}.approvalHint`),
      options: [{ value: 'approval', label: t(`${key}.approval`) }, { value: 'message', label: t(`${key}.message`) }] },
    { id: 'approvePlan', type: 'checkbox', label: t(`${key}.approvePlan`), visibleWhen: { field: 'kind', equals: 'approval' } },
    { id: 'selectedTopicId', type: 'select', label: t(`${key}.selectTopic`), required: true,
      options: (projection?.review.topics ?? []).map((topic) => ({
        value: topic.topicId, label: `${topic.title} (${topic.topicId})${topic.topicId === projection?.review.recommendedTopicId ? ` — ${t(`${key}.recommended`)}` : ''}`,
      })), visibleWhen: { field: 'kind', equals: 'approval' } },
    { id: 'body', type: 'textarea', label: t(`${key}.message`), description: t(`${key}.messageHint`), required: true,
      rows: 4, maxLength: 20000, visibleWhen: { field: 'kind', equals: 'message' } },
  ], [projection, t])

  async function respond(values: Record<string, unknown>) {
    if (!projection || !available || inFlight.current) throw createCrudFormError(t('agency.review.readOnly'))
    let original
    try { original = buildPlanReviewRequest(projection.review, values, '') }
    catch { throw createCrudFormError(t(`${key}.invalidResponse`)) }
    const attemptKey = JSON.stringify([planKey, original])
    const externalEventId = attempts.current.get(attemptKey) ?? crypto.randomUUID()
    attempts.current.set(attemptKey, externalEventId)
    const payload = { ...original, externalEventId }
    inFlight.current = true
    try {
      const response = await apiCall<{ requestId?: string; status?: string }>(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!response.ok || !response.result?.requestId || response.result.status !== 'response_received') {
        if ([403, 404, 409].includes(response.status)) void load()
        throw new Error('[internal] Plan response was not acknowledged')
      }
      if (currentPlan.current === planKey) setSubmittedPlan(planKey)
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
      <PortalPageHeader title={t(`${key}.title`)} description={t(`${key}.description`)} action={back} />
      <PortalCard>
        <DocumentReview review={projection.review.plan} canRespond={false} submitting={false}
          submitted={null} error={null} onRespond={readOnlyResponse} />
      </PortalCard>
      <PortalCard>
        <p className="text-sm">{t(`${key}.recommended`)}: {projection.review.topics.find((topic) => topic.topicId === projection.review.recommendedTopicId)?.title} ({projection.review.recommendedTopicId})</p>
        {projection.review.plan.status === 'approved' && projection.review.plan.acceptanceReceipt && projection.review.selectedTopicId
          ? <p className="mt-2 text-sm">{t(`${key}.savedTopic`)}: {projection.review.topics.find((topic) => topic.topicId === projection.review.selectedTopicId)?.title} ({projection.review.selectedTopicId})</p>
          : null}
      </PortalCard>
      <PortalCard>
        {submitted ? <Alert status="success"><AlertDescription>{t(`${key}.received`)}</AlertDescription></Alert>
          : available ? <CrudForm key={planKey} formId={`agency-plan-review-${taskId}`} embedded disableInitialFocus
            fields={fields} initialValues={initialValues} onSubmit={respond} submitLabel={t(`${key}.send`)} />
            : <Alert status="information"><AlertDescription>{t('agency.review.readOnly')}</AlertDescription></Alert>}
      </PortalCard>
    </div>
  )
}


