/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import AgencyTaskPage from '../components/AgencyTaskPage'
import type { DocumentReview } from '../data/document-review'
import en from '../i18n/en.json'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/acme/portal/tasks/task-1', useSearchParams: () => new URLSearchParams() }))
jest.mock('next/dynamic', () => {
  return (loader: () => Promise<unknown>) => {
    const source = loader.toString()
    const label = source.includes('publication-consent') ? 'Publication consent viewer'
      : source.includes('strategy-review') ? 'Strategy review viewer'
        : source.includes('plan-review') ? 'Plan review viewer'
          : source.includes('post-review') ? 'Post review viewer'
            : 'Standard task viewer'
    return function DynamicTask(props: { taskId?: string }) { return <p>{label}{props.taskId ? `:${props.taskId}` : ''}</p> }
  }
})
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/portal/hooks/usePortalAppEvent', () => ({ usePortalAppEvent: jest.fn() }))
jest.mock('@open-mercato/ui/backend/injection/useGuardedMutation', () => ({
  useGuardedMutation: () => ({
    runMutation: async ({ operation }: { operation: () => Promise<void> }) => operation(),
    retryLastMutation: jest.fn(),
  }),
}))

const review: DocumentReview = {
  caseId: 'case-1', documentId: 'brief-1', versionId: 'version-2', version: '2',
  templateId: 'WZR-BRIEF', title: 'Current brief', html: '<h1>Projected current brief</h1>',
  status: 'ready_for_review', isCurrent: true, mode: 'content',
}
const nativeDetail = {
  ok: true, formKey: 'agency.brief-review', canComplete: true,
  task: { id: 'task-1', taskName: 'Review brief', status: 'PENDING', formSchema: { fields: [] } },
}

function response(result: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, result, response: {} as Response, cacheStatus: null }
}

function mount() {
  return render(<I18nProvider locale="en" dict={en}><AgencyTaskPage params={{ orgSlug: 'acme', id: 'task-1' }} /></I18nProvider>)
}

beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: jest.fn(() => 'review-event-1') })
})

it('loads the exact projected review and keeps its retry-stable response bound to the version', async () => {
  jest.mocked(apiCall)
    .mockResolvedValueOnce(response(nativeDetail))
    .mockResolvedValueOnce(response({ ok: true, review, canRespond: true }))
    .mockResolvedValueOnce(response({ error: 'temporary failure' }, 500))
    .mockResolvedValueOnce(response({ requestId: 'request-1', status: 'received' }, 201))
  mount()
  const frame = await screen.findByTitle('Current brief — version 2')
  expect(frame.getAttribute('srcdoc')).toContain(review.html)
  expect(apiCall).toHaveBeenNthCalledWith(1, '/api/workflows/portal/tasks/task-1')
  expect(apiCall).toHaveBeenNthCalledWith(2, '/api/agency/reviews/task-1')
  fireEvent.load(frame)
  fireEvent.click(screen.getByRole('button', { name: en['agency.review.accept'] }))
  await screen.findByText(en['agency.review.submitError'])
  fireEvent.click(screen.getByRole('button', { name: en['agency.review.accept'] }))
  await screen.findByText(en['agency.review.accepted'])
  const writes = jest.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe('/api/agency/cases/case-1/requests')
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body)
  expect(JSON.parse(writes[0][1]?.body as string)).toEqual({
    channel: 'portal', kind: 'approval', documentId: review.documentId,
    versionId: review.versionId, externalEventId: 'review-event-1',
  })
})

it.each([
  { canComplete: false, canRespond: true },
  { canComplete: true, canRespond: false },
])('requires native and projected actability together: %j', async (authority) => {
  jest.mocked(apiCall)
    .mockResolvedValueOnce(response({ ...nativeDetail, canComplete: authority.canComplete }))
    .mockResolvedValueOnce(response({ ok: true, review, canRespond: authority.canRespond }))
  mount()
  await screen.findByTitle('Current brief — version 2')
  expect(screen.queryByRole('button', { name: en['agency.review.accept'] })).toBeNull()
  expect(screen.queryByRole('button', { name: en['agency.review.sendComments'] })).toBeNull()
})

it.each([403, 404])('never falls back to an embedded snapshot when the projected review returns %s', async (status) => {
  jest.mocked(apiCall)
    .mockResolvedValueOnce(response({ ...nativeDetail, task: { ...nativeDetail.task, formSchema: { agencyReview: review } } }))
    .mockResolvedValueOnce(response({ error: 'unavailable' }, status))
  mount()
  await screen.findByText(en[status === 404 ? 'agency.review.notFound' : 'agency.review.loadError'])
  expect(screen.queryByTitle('Current brief — version 2')).toBeNull()
  expect(screen.queryByText('Standard task viewer')).toBeNull()
})

it('keeps existing embedded reviews without fetching the projection endpoint', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({
    ...nativeDetail, formKey: null, task: { ...nativeDetail.task, formSchema: { agencyReview: review } },
  }))
  mount()
  await screen.findByTitle('Current brief — version 2')
  expect(apiCall).toHaveBeenCalledTimes(1)
})

it('leaves ordinary native tasks with the standard viewer', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...nativeDetail, formKey: null }))
  mount()
  await screen.findByText('Standard task viewer')
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1))
})

it('dispatches the separate publication-consent task without loading a document-review projection', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...nativeDetail, formKey: 'agency.publication-consent' }))
  mount()
  await screen.findByText('Publication consent viewer:task-1')
  expect(screen.queryByText('Standard task viewer')).toBeNull()
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1))
})
