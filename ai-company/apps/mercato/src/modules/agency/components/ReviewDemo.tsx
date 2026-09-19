'use client'

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

const REVIEW_CSS = `
.ag-review .ag-note{font-size:12.5px;color:var(--muted-foreground);background:color-mix(in srgb,var(--foreground) 5%,transparent);border:1px dashed var(--border);border-radius:12px;padding:11px 14px}
.ag-review .ag-tasks-h{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ag-review .ag-tasks-h h2{font-size:15px;font-weight:500;margin:0}
.ag-review .ag-tasklist{display:flex;flex-direction:column;gap:11px;max-width:680px}
.ag-review .ag-task{display:flex;align-items:center;gap:12px;text-align:left;padding:16px;border-radius:14px;border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(14px);transition:transform .1s,border-color .12s}
.ag-review .ag-task:hover{transform:translateY(-2px)}
.ag-review .ag-task.sel{border-color:transparent;color:#fff;background:radial-gradient(150% 180% at 100% 0%,#9b8bff 0%,#7256ec 52%,#5a3fd0 100%);box-shadow:0 20px 46px -28px rgba(90,63,208,.7)}
.ag-review .ag-task-n{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:12px;font-weight:500;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground);flex:none}
.ag-review .ag-task.sel .ag-task-n{background:rgba(255,255,255,.22);color:#fff}
.ag-review .ag-task-tx{min-width:0;flex:1}
.ag-review .ag-task-tx b{font-size:13.5px;font-weight:500;display:block;line-height:1.3}
.ag-review .ag-task-pill{font-size:9.5px;font-weight:500;padding:3px 8px;border-radius:999px;white-space:nowrap;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground);flex:none}
.ag-review .ag-task.sel .ag-task-pill{background:rgba(255,255,255,.22);color:#fff}
.ag-review .ag-task-pill.p-accepted{background:rgba(45,150,90,.16);color:#3fae6b}
.ag-review .ag-task-pill.p-commented{background:rgba(224,144,42,.16);color:#e0902a}
@media (max-width:900px){ .ag-review .ag-tasklist{grid-template-columns:1fr} }
`

