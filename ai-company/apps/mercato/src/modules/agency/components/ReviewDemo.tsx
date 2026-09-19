'use client'

import { REVIEW_CSS } from '../theme/reviewStyles'
import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { DocumentReview } from './DocumentReview'
import { reviewDemoDocuments } from '../data/review-demo'
import { buildReviewRequest } from '../data/document-review'

type Decision = { action: 'accept' | 'comments'; comments: string; topicId: string }

export function ReviewDemo({ orgSlug }: { orgSlug: string }) {
  const t = useT()
  const lastIndex = reviewDemoDocuments.length - 1
  const makeDefaults = (): Record<number, Decision> => {
    const d: Record<number, Decision> = {}
    for (let i = 0; i < lastIndex; i += 1) d[i] = { action: 'accept', comments: '', topicId: '' }
    return d
  }
  const [selected, setSelected] = React.useState(lastIndex)
  const [decisions, setDecisions] = React.useState<Record<number, Decision>>(makeDefaults)
  const [reset, setReset] = React.useState(0)
  const review = reviewDemoDocuments[selected]
  const decision = decisions[selected]

  return (
    <div className="ag-review mx-auto flex w-full max-w-6xl flex-col gap-6">
      <style>{REVIEW_CSS}</style>
      <PortalPageHeader title={t('agency.demo.title')} description={t('agency.demo.description')} action={
        <Button type="button" variant="outline" asChild><Link href={`/${orgSlug}/portal/tasks`}>{t('agency.review.back')}</Link></Button>
      } />
      <div className="ag-note">{t('agency.demo.notice')}</div>
      <div className="ag-tasks-h">
        <h2>Do akceptacji</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => { setDecisions(makeDefaults()); setSelected(lastIndex); setReset((value) => value + 1) }}>{t('agency.demo.reset')}</Button>
      </div>
      <div className="ag-tasklist" aria-label={t('agency.demo.tasks')}>
        {reviewDemoDocuments.map((item, index) => ({ item, index })).reverse().map(({ item, index }) => {
          const st = decisions[index]?.action
          const stKey = st === 'accept' ? 'accepted' : st === 'comments' ? 'commented' : 'pending'
          return (
            <button key={`${item.documentId}:${item.mode}`} type="button"
              className={`ag-task ${selected === index ? 'sel' : ''}`}
              aria-pressed={selected === index} aria-controls="agency-demo-preview" onClick={() => setSelected(index)}>
              <span className="ag-task-n">{stKey === 'accepted' ? '✓' : String(index + 1)}</span>
              <span className="ag-task-tx"><b>{item.title}</b></span>
              <span className={`ag-task-pill p-${stKey}`}>{st === 'accept' ? 'Zaakceptowane' : st === 'comments' ? 'Uwagi wysłane' : 'Do akceptacji'}</span>
            </button>
          )
        })}
      </div>
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

