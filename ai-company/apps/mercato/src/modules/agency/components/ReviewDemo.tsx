'use client'

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { DocumentReview } from './DocumentReview'
import { reviewDemoDocuments } from '../data/review-demo'
import { buildReviewRequest } from '../data/document-review'

type Decision = { action: 'accept' | 'comments'; comments: string; topicId: string }

export function ReviewDemo({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const [selected, setSelected] = React.useState(0)
  const [decisions, setDecisions] = React.useState<Record<number, Decision>>({})
  const [reset, setReset] = React.useState(0)
  const review = reviewDemoDocuments[selected]
  const decision = decisions[selected]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PortalPageHeader title={t('agency.demo.title')} description={t('agency.demo.description')} action={
        <Button type="button" variant="outline" asChild><Link href={`/${orgSlug}/portal/tasks`}>{t('agency.review.back')}</Link></Button>
      } />
      <Alert status="warning"><AlertDescription>
        <p className="font-semibold">{t('agency.demo.mode')}</p>
        <p>{t('agency.demo.notice')}</p>
      </AlertDescription></Alert>
      <PortalCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('agency.demo.tasks')}</h2>
          <Button type="button" variant="outline" onClick={() => { setDecisions({}); setReset((value) => value + 1) }}>{t('agency.demo.reset')}</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('agency.demo.tasks')}>
          {reviewDemoDocuments.map((item, index) => (
            <Button key={`${item.documentId}:${item.mode}`} type="button" variant={selected === index ? 'secondary' : 'outline'}
              className="h-auto min-h-20 flex-col items-start whitespace-normal px-4 py-3 text-left"
              aria-pressed={selected === index} aria-controls="agency-demo-preview" onClick={() => setSelected(index)}>
              <span>{index + 1}. {item.title}</span>
              <Badge variant="outline">{t(decisions[index]?.action === 'accept' ? 'agency.demo.accepted' : decisions[index]?.action === 'comments' ? 'agency.demo.commented' : 'agency.demo.pending')}</Badge>
            </Button>
          ))}
        </div>
      </PortalCard>
      <PortalCard>
        <div id="agency-demo-preview">
          <DocumentReview key={`${selected}:${reset}`} review={review} canRespond demo submitting={false}
            submitted={decision?.action ?? null} error={null}
            onRespond={async (action, topicId, comments) => {
              buildReviewRequest(review, action, topicId, comments, `demo-${selected}-${reset}`)
              setDecisions((current) => ({ ...current, [selected]: { action, topicId, comments: comments.trim() } }))
              return true
            }} />
          {decision ? <div className="mt-4 space-y-2 border-t border-border pt-4" aria-live="polite">
            {decision.topicId && decision.action === 'accept' ? <p className="text-sm">{t('agency.demo.selectedTopic')}: {review.topics?.find((topic) => topic.id === decision.topicId)?.title}</p> : null}
            {decision.comments ? <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{decision.comments}</p> : null}
          </div> : null}
        </div>
      </PortalCard>
    </div>
  )
}
