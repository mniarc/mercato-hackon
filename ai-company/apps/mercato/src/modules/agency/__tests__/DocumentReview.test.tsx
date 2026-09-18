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

test('renders received HTML in an isolated iframe and accepts only after loading', async () => {
  const respond = mount()
  const frame = screen.getByTitle('Brief — wersja 2')
  expect(frame.getAttribute('sandbox')).toBe('')
  expect(frame.getAttribute('srcdoc')).toContain(review.html)
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'")
  expect(screen.getByRole('button', { name: 'Akceptuj' })).toBeDisabled()
  fireEvent.load(frame)
  fireEvent.click(screen.getByRole('button', { name: 'Akceptuj' }))
  await waitFor(() => expect(respond).toHaveBeenCalledWith('accept', '', ''))
})

test('opens a comments dialog, rejects whitespace and sends comments separately', async () => {
  const respond = mount()
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj uwagi' }))
  const input = await screen.findByRole('textbox', { name: /Twoje uwagi/ })
  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij uwagi' }))
  await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
  expect(respond).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'Zmień odbiorców na właścicieli firm.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij uwagi' }))
  await waitFor(() => expect(respond).toHaveBeenCalledWith('comments', '', 'Zmień odbiorców na właścicieli firm.'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('keeps comments after a failed request', async () => {
  mount({ onRespond: jest.fn().mockResolvedValue(false) })
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj uwagi' }))
  const input = await screen.findByRole('textbox', { name: /Twoje uwagi/ })
  fireEvent.change(input, { target: { value: 'Popraw cel.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij uwagi' }))
  await screen.findByText(pl['agency.review.submitError'])
  expect(input).toHaveValue('Popraw cel.')
  expect(screen.getByRole('dialog')).toBeVisible()
})

test('Escape closes the dialog without sending a decision', async () => {
  const respond = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj uwagi' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(respond).not.toHaveBeenCalled()
})

test.each(['ctrlKey', 'metaKey'])('%s + Enter sends the comments once', async (modifier) => {
  const respond = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj uwagi' }))
  const input = await screen.findByRole('textbox', { name: /Twoje uwagi/ })
  fireEvent.change(input, { target: { value: 'Doprecyzuj odbiorców.' } })
  fireEvent.keyDown(input, { key: 'Enter', [modifier]: true })
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
  expect(respond).toHaveBeenCalledWith('comments', '', 'Doprecyzuj odbiorców.')
})

test.each([{ isCurrent: false }, { status: 'needs_review' as const }])('stale documents remain visible without actions: %j', (override) => {
  mount({ review: { ...review, ...override } })
  expect(screen.getByTitle('Brief — wersja 2')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Akceptuj' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Dodaj uwagi' })).toBeNull()
})

test('readers and already submitted decisions cannot act', () => {
  mount({ canRespond: false })
  expect(screen.getByTitle('Brief — wersja 2')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Akceptuj' })).toBeNull()
})
