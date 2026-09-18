'use client'

import * as React from 'react'
import { Check, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { canAcceptDocument, type DocumentReview as Review } from '../data/document-review'

type Annotation = { id: string; quote: string; text: string }

type Props = {
  review: Review
  canRespond: boolean
  submitting: boolean
  submitted: 'accept' | 'comments' | null
  error: string | null
  demo?: boolean
  onRespond: (action: 'accept' | 'comments', topicId: string, comments: string) => Promise<boolean>
}

// Injected into the sandboxed document so annotated fragments are visible.
const HIGHLIGHT_STYLE = 'mark[data-comment-id]{background:#fde68a;color:inherit;border-radius:2px;padding:0 1px;cursor:pointer}mark[data-comment-id].is-active{background:#f59e0b;color:#111827}'

function markElement(doc: Document, id: string) {
  const mark = doc.createElement('mark')
  mark.setAttribute('data-comment-id', id)
  return mark
}

// Wrap the selected range in <mark> elements, splitting across text nodes when
// the selection crosses element boundaries so highlighting survives rich markup.
function wrapRange(doc: Document, range: Range, id: string) {
  const singleTextNode = range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE
  if (singleTextNode) {
    try { range.surroundContents(markElement(doc, id)) } catch { /* non-splittable range */ }
    return
  }
  const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer
  if (!rootNode) return
  const walker = doc.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node) && (node.textContent ?? '').length > 0) textNodes.push(node as Text)
    node = walker.nextNode()
  }
  textNodes.forEach((textNode) => {
    const start = textNode === range.startContainer ? range.startOffset : 0
    const end = textNode === range.endContainer ? range.endOffset : textNode.length
    if (start >= end) return
    const piece = doc.createRange()
    piece.setStart(textNode, start)
    piece.setEnd(textNode, end)
    try { piece.surroundContents(markElement(doc, id)) } catch { /* non-splittable range */ }
  })
}

function unwrapMarks(doc: Document, id: string) {
  doc.querySelectorAll(`mark[data-comment-id="${id}"]`).forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

export function DocumentReview({ review, canRespond, submitting, submitted, error, demo = false, onRespond }: Props) {
  const t = useT()
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const selectionRef = React.useRef<{ range: Range; quote: string } | null>(null)
  const textareaRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [annotations, setAnnotations] = React.useState<Annotation[]>([])
  const [selRect, setSelRect] = React.useState<{ top: number; left: number } | null>(null)
  const [loaded, setLoaded] = React.useState(false)
  const [topicId, setTopicId] = React.useState('')
  const [focusId, setFocusId] = React.useState<string | null>(null)

  const available = canRespond && !submitted && review.isCurrent && review.status === 'ready_for_review'
  const canAccept = available && loaded && canAcceptDocument(review, topicId)
  const hasComments = annotations.some((annotation) => annotation.text.trim().length > 0)

  const availableRef = React.useRef(available)
  React.useEffect(() => { availableRef.current = available }, [available])

  const srcDoc = React.useMemo(() => {
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`
    return `<!doctype html><html><head>${policy}<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${review.html}</body></html>`
  }, [review.html])

  const clearSelection = React.useCallback(() => { setSelRect(null); selectionRef.current = null }, [])

  const handleDocMouseUp = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    const selection = doc?.getSelection()
    if (!doc || !selection || selection.isCollapsed || selection.rangeCount === 0) { clearSelection(); return }
    const quote = selection.toString().trim()
    if (!quote || !availableRef.current) { clearSelection(); return }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    selectionRef.current = { range: range.cloneRange(), quote }
    setSelRect({ top: rect.bottom, left: rect.left })
  }, [clearSelection])

  const handleDocScroll = React.useCallback(() => { setSelRect(null) }, [])

  const handleLoad = React.useCallback(() => {
    setLoaded(true)
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const style = doc.createElement('style')
    style.textContent = HIGHLIGHT_STYLE
    doc.head.appendChild(style)
    doc.addEventListener('mouseup', handleDocMouseUp)
    doc.addEventListener('scroll', handleDocScroll, true)
  }, [handleDocMouseUp, handleDocScroll])

  React.useEffect(() => () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.removeEventListener('mouseup', handleDocMouseUp)
    doc.removeEventListener('scroll', handleDocScroll, true)
  }, [handleDocMouseUp, handleDocScroll])

  React.useEffect(() => {
    if (!focusId) return
    textareaRefs.current[focusId]?.focus()
    setFocusId(null)
  }, [focusId, annotations])

  const addComment = React.useCallback(() => {
    const info = selectionRef.current
    const doc = iframeRef.current?.contentDocument
    if (!info || !doc) return
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    wrapRange(doc, info.range, id)
    doc.getSelection()?.removeAllRanges()
    setAnnotations((current) => [...current, { id, quote: info.quote, text: '' }])
    setFocusId(id)
    clearSelection()
  }, [clearSelection])

  const removeComment = React.useCallback((id: string) => {
    const doc = iframeRef.current?.contentDocument
    if (doc) unwrapMarks(doc, id)
    setAnnotations((current) => current.filter((annotation) => annotation.id !== id))
  }, [])

  const updateComment = React.useCallback((id: string, text: string) => {
    setAnnotations((current) => current.map((annotation) => (annotation.id === id ? { ...annotation, text } : annotation)))
  }, [])

  const focusFragment = React.useCallback((id: string) => {
    const doc = iframeRef.current?.contentDocument
    const mark = doc?.querySelector(`mark[data-comment-id="${id}"]`)
    if (!mark) return
    doc?.querySelectorAll('mark[data-comment-id].is-active').forEach((element) => element.classList.remove('is-active'))
    mark.classList.add('is-active')
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const sendComments = React.useCallback(async () => {
    const body = annotations
      .filter((annotation) => annotation.text.trim().length > 0)
      .map((annotation, index) => `${index + 1}. „${annotation.quote}"\n   → ${annotation.text.trim()}`)
      .join('\n\n')
    if (!body) return
    await onRespond('comments', topicId, body)
  }, [annotations, onRespond, topicId])

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="relative">
            <iframe
              ref={iframeRef}
              title={t('agency.review.previewTitle', { title: review.title, version: review.version })}
              srcDoc={srcDoc}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              className="h-dvh max-h-192 min-h-96 w-full rounded-lg border border-border bg-white"
              onLoad={handleLoad}
            />
            {available && selRect ? (
              <div className="absolute z-10" style={{ top: selRect.top + 8, left: selRect.left }}>
                <Button type="button" size="sm" onClick={addComment}>
                  <MessageSquarePlus className="size-4" />{t('agency.review.addComment')}
                </Button>
              </div>
            ) : null}
          </div>

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
              <div className="flex justify-end">
                <Button type="button" disabled={submitting || !canAccept} onClick={() => { void onRespond('accept', topicId, '') }}>
                  <Check className="size-4" />{t(submitting ? 'agency.review.sending' : 'agency.review.accept')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="h-fit space-y-3 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('agency.review.commentsPanelTitle')}</h3>
            {annotations.length ? <Badge variant="outline">{annotations.length}</Badge> : null}
          </div>
          {available ? (
            <>
              {annotations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('agency.review.commentsEmpty')}</p>
              ) : (
                <ul className="space-y-3">
                  {annotations.map((annotation) => (
                    <li key={annotation.id} className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Button type="button" variant="ghost" onClick={() => focusFragment(annotation.id)}
                          className="h-auto w-full justify-start whitespace-normal p-0 text-left text-xs italic text-muted-foreground hover:bg-transparent hover:text-foreground">
                          „{annotation.quote}"
                        </Button>
                        <IconButton type="button" variant="ghost" size="sm" aria-label={t('agency.review.removeComment')} onClick={() => removeComment(annotation.id)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                      <Textarea
                        ref={(element) => { textareaRefs.current[annotation.id] = element }}
                        value={annotation.text}
                        onChange={(event) => updateComment(annotation.id, event.target.value)}
                        disabled={submitting}
                        rows={3}
                        placeholder={t('agency.review.commentPlaceholder')}
                        aria-label={t('agency.review.commentPlaceholder')}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <Button type="button" className="w-full" disabled={submitting || !hasComments} onClick={() => { void sendComments() }}>
                <MessageSquarePlus className="size-4" />{t(submitting ? 'agency.review.sending' : 'agency.review.sendComments')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('agency.review.readOnly')}</p>
          )}
        </aside>
      </div>
    </section>
  )
}
