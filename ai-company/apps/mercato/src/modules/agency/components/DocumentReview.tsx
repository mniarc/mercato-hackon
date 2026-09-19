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
import { canAcceptDocument, canCommentDocument, type DocumentReview as Review } from '../data/document-review'

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

// A srcdoc document does not inherit the portal's reset or typography. Keep
// this aligned with the native documents preview contract while retaining the
// iframe boundary required for safe selection and annotations.
const DOCUMENT_PREVIEW_STYLE = [
  ':root{color-scheme:light;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0a0a0a;background:#fff}',
  '*{box-sizing:border-box}',
  'body{margin:0;padding:1rem;font-family:inherit;font-size:1rem;line-height:1.75;overflow-wrap:anywhere}',
  'body>:first-child{margin-top:0}body>:last-child{margin-bottom:0}',
  'h1,h2,h3{line-height:1.25}',
  'h1{margin:2rem 0 1rem;font-size:1.875rem;font-weight:700}',
  'h2{margin:1.75rem 0 .75rem;font-size:1.5rem;font-weight:600}',
  'h3{margin:1.5rem 0 .5rem;font-size:1.25rem;font-weight:600}',
  'p,ul,ol{margin:1rem 0}ul,ol{padding-left:1.5rem}li{margin:.25rem 0}',
  'blockquote{margin:1.5rem 0;border-left:4px solid #e4e4e7;padding-left:1rem;font-style:italic}',
  'pre{margin:1.5rem 0;overflow-x:auto;border-radius:.375rem;background:#f4f4f5;padding:1rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875rem}',
  'a{color:#4f46e5;text-decoration:underline;text-underline-offset:.25rem}',
  'img{max-width:100%;height:auto;margin:1.5rem 0;border-radius:.375rem}',
  'table{width:100%;margin:1.5rem 0;border-collapse:collapse}',
  'th,td{border:1px solid #e4e4e7;padding:.5rem .75rem;text-align:left;vertical-align:top}th{background:#f4f4f5}',
].join('')

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

  const available = canRespond && !submitted && canCommentDocument(review)
  const canAccept = available && loaded && canAcceptDocument(review, topicId)
  const hasComments = annotations.some((annotation) => annotation.text.trim().length > 0)
  const acceptanceReceipt = review.status === 'approved' ? review.acceptanceReceipt : undefined

  const availableRef = React.useRef(available)
  React.useEffect(() => { availableRef.current = available }, [available])

  const srcDoc = React.useMemo(() => {
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`
    const styles = `<style id="agency-document-preview-style">${DOCUMENT_PREVIEW_STYLE}</style>`
    return `<!doctype html><html><head>${policy}<meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body>${review.html}</body></html>`
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

  // A srcdoc iframe can fire its load event before React wires an onLoad prop,
  // leaving the first document uninitialised (no `loaded`, no selection listener).
  // Attach through a ref-driven effect and also cover the already-loaded case.
  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let attachedDoc: Document | null = null
    const setup = () => {
      setLoaded(true)
      const doc = iframe.contentDocument
      if (!doc || !doc.body || attachedDoc === doc) return
      attachedDoc = doc
      if (!doc.getElementById('agency-annotation-style')) {
        const style = doc.createElement('style')
        style.id = 'agency-annotation-style'
        style.textContent = HIGHLIGHT_STYLE
        doc.head.appendChild(style)
      }
      doc.addEventListener('mouseup', handleDocMouseUp)
      doc.addEventListener('scroll', handleDocScroll, true)
    }
    const ready = iframe.contentDocument
    if (ready?.readyState === 'complete' && ready.body && ready.body.childNodes.length > 0) setup()
    iframe.addEventListener('load', setup)
    return () => {
      iframe.removeEventListener('load', setup)
      if (attachedDoc) {
        attachedDoc.removeEventListener('mouseup', handleDocMouseUp)
        attachedDoc.removeEventListener('scroll', handleDocScroll, true)
      }
    }
  }, [srcDoc, handleDocMouseUp, handleDocScroll])

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
          {acceptanceReceipt ? (
            <Alert status="success"><AlertDescription>
              <p>{t('agency.review.acceptanceRecorded', { version: review.version })}</p>
              <p>{t('agency.review.acceptanceRecordedAt')} <time dateTime={acceptanceReceipt.acceptedAt}>{new Date(acceptanceReceipt.acceptedAt).toLocaleString()}</time></p>
            </AlertDescription></Alert>
          ) : submitted ? (
            <Alert status="success"><AlertDescription>{t(demo ? 'agency.demo.localResult' : submitted === 'accept' ? 'agency.review.accepted' : 'agency.review.commentsSent')}</AlertDescription></Alert>
          ) : !available ? (
            <Alert status="information"><AlertDescription>{t(!review.isCurrent || review.status === 'needs_review' ? 'agency.review.stale' : 'agency.review.readOnly')}</AlertDescription></Alert>
          ) : (
            <div className="space-y-4 border-t border-border pt-4">
              {review.status === 'needs_review' ? (
                <Alert status="information"><AlertDescription>{t('agency.review.clarificationOnly')}</AlertDescription></Alert>
              ) : null}
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
