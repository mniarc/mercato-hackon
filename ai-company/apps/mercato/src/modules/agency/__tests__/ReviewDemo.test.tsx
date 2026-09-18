/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { ReviewDemo } from '../components/ReviewDemo'
import { reviewDemoDocuments } from '../data/review-demo'
import { documentReviewSchema } from '../data/document-review'
import pl from '../i18n/pl.json'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

test('all six template examples have valid versioned review data', () => {
  expect(reviewDemoDocuments).toHaveLength(6)
  for (const review of reviewDemoDocuments) expect(documentReviewSchema.safeParse(review).success).toBe(true)
  const plan = reviewDemoDocuments.find((review) => review.mode === 'topic_choice')!
  expect(plan.topics).toHaveLength(12)
  expect(new Set(plan.topics!.map((topic) => topic.id)).size).toBe(12)
  const post = reviewDemoDocuments.find((review) => review.templateId === 'WZR-POST' && review.mode === 'content')!
  const consent = reviewDemoDocuments.find((review) => review.mode === 'publication')!
  const parser = new DOMParser()
  expect(parser.parseFromString(consent.html, 'text/html').querySelector('.post')?.textContent)
    .toBe(parser.parseFromString(post.html, 'text/html').querySelector('.post')?.textContent)
  expect(consent.versionId).toBe(post.versionId)
})

test('a customer can switch documents, accept locally and reset the preview', async () => {
  render(<I18nProvider locale="pl" dict={pl}><ReviewDemo orgSlug="acme" /></I18nProvider>)
  expect(screen.getByText('Tryb testowy')).toBeTruthy()
  for (const [index, document] of reviewDemoDocuments.entries()) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${index + 1}\\. ${document.title}`) }))
    const frame = screen.getByTitle(`${document.title} — wersja ${document.version}`)
    expect(frame.getAttribute('srcdoc')).toContain(document.html)
    fireEvent.load(frame)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Akceptuj' }))
  await screen.findByText('Wynik tej próby jest lokalny — nic nie wysłano.')
  expect(screen.getByText('Zaakceptowano testowo')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Zresetuj test' }))
  await waitFor(() => expect(screen.queryByText('Zaakceptowano testowo')).toBeNull())
  expect(screen.getByRole('button', { name: 'Dodaj uwagi' })).toBeTruthy()
})
