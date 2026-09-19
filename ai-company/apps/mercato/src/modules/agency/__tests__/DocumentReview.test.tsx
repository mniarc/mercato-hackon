/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { DocumentReview } from '../components/DocumentReview'
import type { DocumentReview as Review } from '../data/document-review'
import pl from '../i18n/pl.json'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/acme/portal/tasks/review', useSearchParams: () => new URLSearchParams() }))

beforeAll(() => {
  if (typeof Response === 'undefined') Object.defineProperty(globalThis, 'Response', { value: class Response {}, configurable: true })
})

const review: Review = {
  caseId: 'case-1', documentId: 'brief-1', versionId: 'brief-v2', version: '2',
  templateId: 'WZR-BRIEF', title: 'Brief', html: '<h1>Brief marki</h1><p>Cel i odbiorcy</p>',
  status: 'ready_for_review', isCurrent: true, mode: 'content',
}

function mount(overrides: Partial<React.ComponentProps<typeof DocumentReview>> = {}) {
  const onRespond = jest.fn().mockResolvedValue(true)
  render(<I18nProvider locale="pl" dict={pl}><DocumentReview review={review} canRespond submitting={false} submitted={null} error={null} onRespond={onRespond} {...overrides} /></I18nProvider>)
  return onRespond
}

test('renders received HTML in a same-origin sandboxed iframe and accepts only after loading', async () => {
  const respond = mount()
  const frame = screen.getByTitle('Brief — wersja 2')
  const srcDoc = frame.getAttribute('srcdoc') ?? ''
  expect(frame.getAttribute('sandbox')).toBe('allow-same-origin')
  expect(srcDoc).toContain(`<body>${review.html}</body>`)
  expect(srcDoc).toContain("default-src 'none'")
  expect(srcDoc).toContain('<style id="agency-document-preview-style">')
  expect(srcDoc).toContain('font-family:ui-sans-serif,system-ui')
  expect(screen.getByRole('button', { name: pl['agency.review.accept'] })).toBeDisabled()
  fireEvent.load(frame)
  fireEvent.click(screen.getByRole('button', { name: pl['agency.review.accept'] }))
  await waitFor(() => expect(respond).toHaveBeenCalledWith('accept', '', ''))
})

test('shows the side comments panel with an empty hint and a disabled send button', () => {
  mount()
  expect(screen.getByText(pl['agency.review.commentsPanelTitle'])).toBeTruthy()
  expect(screen.getByText(pl['agency.review.commentsEmpty'])).toBeTruthy()
  expect(screen.getByRole('button', { name: pl['agency.review.sendComments'] })).toBeDisabled()
})

test('a current brief needing clarification accepts annotated comments but never acceptance', async () => {
  const respond = mount({ review: { ...review, status: 'needs_review' } })
  const frame = screen.getByTitle('Brief — wersja 2') as HTMLIFrameElement
  const doc = frame.contentDocument!
  doc.body.innerHTML = '<p>Cel i odbiorcy</p>'
  fireEvent.load(frame)
  expect(screen.getByRole('button', { name: pl['agency.review.accept'] })).toBeDisabled()
  expect(screen.getByText(pl['agency.review.clarificationOnly'])).toBeTruthy()
  const range = doc.createRange()
  range.selectNodeContents(doc.body.firstChild!)
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => ({ bottom: 10, left: 0 }) })
  doc.getSelection()!.addRange(range)
  fireEvent.mouseUp(doc)
  fireEvent.click(await screen.findByRole('button', { name: pl['agency.review.addComment'] }))
  fireEvent.change(screen.getByRole('textbox', { name: pl['agency.review.commentPlaceholder'] }), { target: { value: 'Odbiorcami są lokalne sklepy.' } })
  fireEvent.click(screen.getByRole('button', { name: pl['agency.review.sendComments'] }))
  await waitFor(() => expect(respond).toHaveBeenCalledWith('comments', '', expect.stringContaining('Odbiorcami są lokalne sklepy.')))
  expect(respond).toHaveBeenCalledTimes(1)
})

test.each([
  { isCurrent: false },
  { isCurrent: false, status: 'needs_review' as const },
  { status: 'approved' as const },
  { status: 'blocked' as const },
  { status: 'draft' as const },
])('stale or non-actionable documents remain visible without actions: %j', (override) => {
  mount({ review: { ...review, ...override } })
  expect(screen.getByTitle('Brief — wersja 2')).toBeTruthy()
  expect(screen.queryByRole('button', { name: pl['agency.review.accept'] })).toBeNull()
  expect(screen.queryByRole('button', { name: pl['agency.review.sendComments'] })).toBeNull()
})

test('readers cannot act and see the read-only note', () => {
  mount({ canRespond: false })
  expect(screen.getByTitle('Brief — wersja 2')).toBeTruthy()
  expect(screen.queryByRole('button', { name: pl['agency.review.accept'] })).toBeNull()
  expect(screen.queryByRole('button', { name: pl['agency.review.sendComments'] })).toBeNull()
  expect(screen.getAllByText(pl['agency.review.readOnly']).length).toBeGreaterThan(0)
})

test.each([true, false])('shows a saved exact-version acceptance receipt without offering another decision (current: %s)', (isCurrent) => {
  const acceptedAt = '2026-09-19T12:30:00.000Z'
  mount({ review: { ...review, status: 'approved', isCurrent, acceptanceReceipt: { acceptedAt } }, submitted: 'accept' })
  expect(screen.getByText(pl['agency.review.acceptanceRecorded'].replace('{version}', review.version))).toBeTruthy()
  expect(document.querySelector('time')).toHaveAttribute('datetime', acceptedAt)
  expect(screen.queryByText(pl['agency.review.accepted'])).toBeNull()
  expect(screen.queryByRole('button', { name: pl['agency.review.accept'] })).toBeNull()
})

test('response acknowledgment does not become a recorded acceptance', () => {
  mount({ submitted: 'accept' })
  expect(screen.getByText(pl['agency.review.accepted'])).toBeTruthy()
  expect(screen.queryByText(pl['agency.review.acceptanceRecordedAt'])).toBeNull()
  expect(document.querySelector('time')).toBeNull()
})

test('a receipt on a non-approved projection is not rendered as acceptance', () => {
  mount({ review: { ...review, acceptanceReceipt: { acceptedAt: '2026-09-19T12:30:00.000Z' } } })
  expect(screen.queryByText(pl['agency.review.acceptanceRecordedAt'])).toBeNull()
  expect(document.querySelector('time')).toBeNull()
})
