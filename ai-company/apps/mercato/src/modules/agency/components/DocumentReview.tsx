'use client'

import * as React from 'react'
import { Check, MessageSquare } from 'lucide-react'
import { z } from 'zod'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { canAcceptDocument, type DocumentReview as Review } from '../data/document-review'

type Props = {
  review: Review
  canRespond: boolean
  submitting: boolean
  submitted: 'accept' | 'comments' | null
  error: string | null
  demo?: boolean
  onRespond: (action: 'accept' | 'comments', topicId: string, comments: string) => Promise<boolean>
}

export function DocumentReview({ review, canRespond, submitting, submitted, error, demo = false, onRespond }: Props) {
  const t = useT()
  const [commentsOpen, setCommentsOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [topicId, setTopicId] = React.useState('')
  const [loaded, setLoaded] = React.useState(false)
  const fields = React.useMemo<CrudField[]>(() => [{
    id: 'comments', type: 'custom', label: t('agency.review.commentsLabel'), required: true,
    component: ({ value, setValue, disabled, error: fieldError }) => <Textarea
      aria-label={t('agency.review.commentsLabel')}
      aria-invalid={!!fieldError}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => setValue(event.target.value)}
      disabled={disabled} rows={6}
      placeholder={t('agency.review.commentsPlaceholder')}
    />,
  }], [t])
  const schema = React.useMemo(() => z.object({ comments: z.string().trim().min(1, t('agency.review.commentsRequired')) }), [t])
  const available = canRespond && !submitted && review.isCurrent && review.status === 'ready_for_review'
  const canAccept = available && loaded && canAcceptDocument(review, topicId)
  const srcDoc = React.useMemo(() => {
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`
    return `<!doctype html><html><head>${policy}<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${review.html}</body></html>`
  }, [review.html])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{review.title}</h2>
        <Badge variant="outline">{t('agency.review.version', { version: review.version })}</Badge>
      </div>
      {review.templateId === 'WZR-STRATEGIA' || review.templateId === 'WZR-TOV' ? (
        <p className="text-sm text-muted-foreground">{t('agency.review.pairHint')}</p>
      ) : null}
      {review.mode === 'publication' ? (
        <Alert status="information"><AlertDescription>
          <p>{t('agency.review.publicationHint')}</p>
          {review.target ? <p className="mt-2 font-medium">{review.target.platform} · {review.target.label}</p> : <p>{t('agency.review.missingTarget')}</p>}
        </AlertDescription></Alert>
      ) : null}
      <iframe
        title={t('agency.review.previewTitle', { title: review.title, version: review.version })}
        srcDoc={srcDoc}
        sandbox=""
        referrerPolicy="no-referrer"
        className="h-dvh max-h-192 min-h-96 w-full rounded-lg border border-border bg-white"
        onLoad={() => setLoaded(true)}
      />
      {review.mode === 'topic_choice' && available ? (
        <div className="space-y-2">
          <Label htmlFor="agency-review-topic">{t('agency.review.topicLabel')}</Label>
          <Select value={topicId} onValueChange={setTopicId} disabled={submitting}>
            <SelectTrigger id="agency-review-topic" className="w-full"><SelectValue placeholder={t('agency.review.topicPlaceholder')} /></SelectTrigger>
            <SelectContent>{review.topics?.map((topic) => <SelectItem key={topic.id} value={topic.id} disabled={topic.readiness !== 'ready'}>{topic.title}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{t('agency.review.topicHint')}</p>
        </div>
      ) : null}
      {error ? <Alert status="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {submitted ? (
        <Alert status="success"><AlertDescription>{t(demo ? 'agency.demo.localResult' : submitted === 'accept' ? 'agency.review.accepted' : 'agency.review.commentsSent')}</AlertDescription></Alert>
      ) : !available ? (
        <Alert status="information"><AlertDescription>{t(!review.isCurrent || review.status === 'needs_review' ? 'agency.review.stale' : 'agency.review.readOnly')}</AlertDescription></Alert>
      ) : (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{t('agency.review.versionHint', { version: review.version })}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setCommentsOpen(true)}><MessageSquare className="size-4" />{t('agency.review.addComments')}</Button>
            <Button type="button" disabled={submitting || !canAccept} onClick={() => { void onRespond('accept', topicId, '') }}><Check className="size-4" />{t(submitting ? 'agency.review.sending' : 'agency.review.accept')}</Button>
          </div>
        </div>
      )}
      <Dialog open={commentsOpen && !!available} onOpenChange={(open) => { if (!submitting) setCommentsOpen(open) }}>
        <DialogContent className="sm:max-w-xl" onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!submitting) event.currentTarget.querySelector('form')?.requestSubmit()
          }
        }}>
          <DialogHeader>
            <DialogTitle>{t('agency.review.addComments')}</DialogTitle>
            <DialogDescription>{t('agency.review.commentsDescription', { title: review.title, version: review.version })}</DialogDescription>
          </DialogHeader>
          <CrudForm<{ comments: string }>
            embedded fields={fields} schema={schema} initialValues={{ comments: draft }}
            submitLabel={t('agency.review.sendComments')}
            extraActions={<Button type="button" variant="outline" disabled={submitting} onClick={() => setCommentsOpen(false)}>{t('agency.review.cancel')}</Button>}
            onSubmit={async ({ comments }) => {
              setDraft(comments)
              if (!await onRespond('comments', topicId, comments)) throw createCrudFormError(t('agency.review.submitError'))
              setCommentsOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}
