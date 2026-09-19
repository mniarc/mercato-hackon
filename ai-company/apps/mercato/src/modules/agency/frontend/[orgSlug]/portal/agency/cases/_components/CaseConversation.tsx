'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage, TabEmptyState } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { ActivityFeed, ActivityFeedItem } from '@open-mercato/ui/primitives/activity-feed'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import type { ClientSubmissionItem } from '@/modules/agency_operations/lib/contracts/clientSubmission'
import type { ClientReplyItem } from '@/modules/agency_operations/lib/contracts/clientReply'
import { ClientMessageForm } from './ClientMessageForm'

export function canReplyToSubmission(item: ClientSubmissionItem) {
  return item.disposition?.kind === 'clarify'
    && item.disposition.targets.caseId === item.caseId
    && item.disposition.targets.submissionId === item.submissionId
    && item.workflow?.status === 'PAUSED'
    && item.workflow.currentStep === 'client_reply'
}

function SubmissionThread({ item, endpoint, refresh, revision }: {
  item: ClientSubmissionItem; endpoint: string; refresh: () => void; revision: number
}) {
  const t = useT()
  const [replies, setReplies] = React.useState<ClientReplyItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const replyEndpoint = `${endpoint}/${encodeURIComponent(item.submissionId)}/replies`
  React.useEffect(() => {
    if (item.disposition?.kind !== 'clarify') { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    readApiResultOrThrow<{ items: ClientReplyItem[] }>(replyEndpoint, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setReplies(result.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [item.disposition?.kind, replyEndpoint, revision])

  return (
    <ActivityFeedItem title={t('agency.conversation.submitted')} timestamp={<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>}
      data-testid={`agency-client-submission-${item.submissionId}`}>
      <div className="w-full space-y-3">
        {item.original.text ? <p className="whitespace-pre-wrap break-words text-sm">{item.original.text}</p> : null}
        {item.original.materialAttachmentId ? <p className="text-sm text-muted-foreground">{t('agency.conversation.materialReferenced')}</p> : null}
        {item.disposition ? (
          <div className="rounded-md border border-border bg-muted p-3 space-y-2">
            <p className="text-sm font-medium">{t(`agency.conversation.disposition.${item.disposition.kind}`)}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{item.disposition.message}</p>
          </div>
        ) : <p className="text-sm text-muted-foreground">{t(item.processing?.state === 'waiting_configuration'
          ? 'agency.conversation.waitingConfiguration' : 'agency.conversation.processing')}</p>}
        {item.disposition?.source === 'deterministic_scaffold' ? <p className="text-sm text-muted-foreground">{t('agency.conversation.scaffold')}</p> : null}
        {loading ? <LoadingMessage label={t('agency.conversation.loadingReplies')} /> : null}
        {error ? <ErrorMessage label={t('agency.conversation.loadError')} /> : null}
        {replies.map((reply) => (
          <div key={reply.replyId} className="space-y-2 border-l border-border pl-4" data-testid={`agency-client-reply-${reply.replyId}`}>
            <p className="text-sm font-medium">{t('agency.conversation.reply')}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{reply.original.text}</p>
            <p className="text-sm text-muted-foreground">{t('agency.conversation.replyReceived')}</p>
          </div>
        ))}
        {replies.length === 0 && canReplyToSubmission(item) ? (
          <ClientMessageForm<ClientReplyItem> endpoint={replyEndpoint} formId={`agency-client-reply-${item.submissionId}`} reply
            available={!loading && !error}
            onSaved={(reply) => { setReplies([reply]); refresh() }} />
        ) : null}
      </div>
    </ActivityFeedItem>
  )
}

export function CaseConversation({ caseId }: { caseId: string }) {
  const t = useT()
  const [items, setItems] = React.useState<ClientSubmissionItem[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const endpoint = `/api/agency/portal/cases/${encodeURIComponent(caseId)}/submissions`
  const refresh = React.useCallback(() => setRevision((value) => value + 1), [])
  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    readApiResultOrThrow<{ items: ClientSubmissionItem[] }>(endpoint, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setItems(result.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [endpoint, revision])

  return (
    <PortalCard>
      <section className="space-y-4" aria-label={t('agency.conversation.title')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('agency.conversation.title')}</h2>
          <Button type="button" variant="outline" disabled={loading} onClick={refresh}>{t('agency.conversation.refresh')}</Button>
        </div>
        {loading ? <LoadingMessage label={t('agency.conversation.loading')} /> : null}
        {error ? <ErrorMessage label={t('agency.conversation.loadError')} /> : null}
        {items ? <>
          {items.length === 0 ? <TabEmptyState title={t('agency.conversation.empty')} /> : (
            <ActivityFeed>
              {items.map((item) => <SubmissionThread key={item.submissionId} item={item} endpoint={endpoint} refresh={refresh} revision={revision} />)}
            </ActivityFeed>
          )}
          <ClientMessageForm<ClientSubmissionItem> endpoint={endpoint} formId="agency-client-message"
            onSaved={(item) => {
              setItems((current) => [item, ...(current ?? []).filter((existing) => existing.submissionId !== item.submissionId)])
              refresh()
            }} />
        </> : null}
      </section>
    </PortalCard>
  )
}
