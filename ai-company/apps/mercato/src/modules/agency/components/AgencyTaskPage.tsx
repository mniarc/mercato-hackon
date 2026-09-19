'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'
import { DocumentReview } from './DocumentReview'
import { buildReviewRequest, canAcceptDocument, canCommentDocument, readDocumentReview } from '../data/document-review'

const StandardTaskPage = dynamic(() => import('@open-mercato/core/modules/workflows/frontend/[orgSlug]/portal/tasks/[id]/page'))
const StrategyPairReview = dynamic(() => import('./strategy-review/StrategyPairReview').then((module) => module.StrategyPairReview))
const PlanReview = dynamic(() => import('./plan-review/PlanReview').then((module) => module.PlanReview))
const PostReview = dynamic(() => import('./post-review/PostReview').then((module) => module.PostReview))

type Props = { params: { orgSlug: string; id: string } }
type Detail = { ok: boolean; task?: { id: string; taskName: string; status: string; formSchema: unknown; updatedAt?: string }; canComplete?: boolean; formKey?: string | null }
type ReviewProjection = { ok: boolean; review: unknown; canRespond: boolean }
type LoadedDetail = Detail & { reviewProjection?: ReviewProjection }

export default function AgencyTaskPage({ params }: Props) {
  return <TaskLoader key={`${params.orgSlug}:${params.id}`} params={params} />
}

function TaskLoader({ params }: Props) {
  const t = useT()
  const [detail, setDetail] = React.useState<LoadedDetail | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [notFound, setNotFound] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState<'accept' | 'comments' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const inFlight = React.useRef(false)
  const attempts = React.useRef(new Map<string, string>())
  const generation = React.useRef(0)
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `agency.review.${params.id}`, blockedMessage: t('agency.review.submitError') })

  const load = React.useCallback(async () => {
    const current = ++generation.current
    setRefreshing(true)
    try {
      const response = await apiCall<Detail>(`/api/workflows/portal/tasks/${encodeURIComponent(params.id)}`)
      if (current !== generation.current) return
      setNotFound(response.status === 404)
      setFailed(!response.ok || !response.result?.ok || !response.result.task)
      if (!response.ok || !response.result?.ok || !response.result.task) return
      if (response.result.formKey === 'agency.brief-review') {
        const projection = await apiCall<ReviewProjection>(`/api/agency/reviews/${encodeURIComponent(params.id)}`)
        if (current !== generation.current) return
        setNotFound(projection.status === 404)
        setFailed(!projection.ok || !projection.result?.ok)
        if (!projection.ok || !projection.result?.ok) return
        setDetail({ ...response.result, reviewProjection: projection.result })
      } else {
        setDetail(response.result)
      }
    } catch {
      if (current === generation.current) setFailed(true)
    } finally {
      if (current === generation.current) setRefreshing(false)
    }
  }, [params.id])

  React.useEffect(() => {
    void load()
    return () => { generation.current += 1 }
  }, [load])
  usePortalAppEvent('workflows.task.portal_assigned', () => { void load() }, [load])
  usePortalAppEvent('agency.*', () => { void load() }, [load])

  const projectedReview = detail?.formKey === 'agency.brief-review'
  const resolution = readDocumentReview(projectedReview ? { agencyReview: detail?.reviewProjection?.review } : detail?.task?.formSchema)
  const review = resolution.kind === 'review' ? resolution.review : null
  const canRespond = detail?.canComplete === true && (!projectedReview || detail?.reviewProjection?.canRespond === true)
  const versionKey = review ? `${review.documentId}:${review.versionId}` : ''
  const currentVersion = React.useRef(versionKey)
  currentVersion.current = versionKey
  React.useEffect(() => { setSubmitted(null); setError(null); attempts.current.clear() }, [versionKey])

  const respond = async (action: 'accept' | 'comments', topicId: string, comments: string) => {
    if (!review || !canRespond || !detail?.task || !['PENDING', 'IN_PROGRESS'].includes(detail.task.status)
      || !(action === 'comments' ? canCommentDocument(review) : canAcceptDocument(review, topicId))
      || inFlight.current || submitted || failed || refreshing) return false
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const attemptKey = JSON.stringify([versionKey, action, topicId, comments.trim()])
      const externalEventId = attempts.current.get(attemptKey) ?? crypto.randomUUID()
      attempts.current.set(attemptKey, externalEventId)
      const payload = buildReviewRequest(review, action, topicId, comments, externalEventId)
      await runMutation({
        context: { taskId: params.id, documentId: review.documentId, versionId: review.versionId, retryLastMutation },
        mutationPayload: payload,
        operation: async () => {
          const response = await apiCall<{ requestId?: string; status?: string }>(`/api/agency/cases/${encodeURIComponent(review.caseId)}/requests`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
          })
          if (!response.ok || !response.result?.requestId || !response.result.status) {
            if (response.status === 409 || response.status === 404) void load()
            throw new Error('[internal] Review request was not acknowledged')
          }
        },
      })
      if (currentVersion.current === versionKey) setSubmitted(action)
      return true
    } catch {
      if (currentVersion.current === versionKey) setError(t('agency.review.submitError'))
      return false
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const back = <Button type="button" variant="outline" asChild><Link href={`/${params.orgSlug}/portal/tasks`}>{t('agency.review.back')}</Link></Button>
  if (notFound) return <PortalCard><PortalPageHeader title={t('agency.review.notFound')} action={back} /></PortalCard>
  if (failed) return <div className="space-y-4"><ErrorMessage label={t('agency.review.loadError')} /><Button type="button" variant="outline" onClick={() => { void load() }}>{t('agency.review.retry')}</Button>{back}</div>
  if (!detail?.task) return <LoadingMessage label={t('agency.review.loading')} />
  if (detail.formKey === 'agency.strategy-pair-review') return <StrategyPairReview taskId={params.id} orgSlug={params.orgSlug}
    canComplete={detail.canComplete === true} taskStatus={detail.task.status} updatedAt={detail.task.updatedAt} />
  if (detail.formKey === 'agency.plan-review') return <PlanReview taskId={params.id} orgSlug={params.orgSlug}
    canComplete={detail.canComplete === true} taskStatus={detail.task.status} updatedAt={detail.task.updatedAt} />
  if (detail.formKey === 'agency.post-review') return <PostReview taskId={params.id} orgSlug={params.orgSlug}
    canComplete={detail.canComplete === true} taskStatus={detail.task.status} updatedAt={detail.task.updatedAt} />
  if (resolution.kind === 'other') return <StandardTaskPage params={params} />
  if (!review) return <div className="space-y-4"><ErrorMessage label={t('agency.review.invalid')} />{back}</div>

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PortalPageHeader label={t('agency.review.pageTitle')} title={detail.task.taskName} description={t('agency.review.description')} action={back} />
      <PortalCard>
        <DocumentReview key={versionKey} review={review} canRespond={canRespond && ['PENDING', 'IN_PROGRESS'].includes(detail.task.status)} submitting={submitting || refreshing} submitted={submitted} error={error} onRespond={respond} />
      </PortalCard>
    </div>
  )
}
