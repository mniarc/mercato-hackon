/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PostReview } from '../PostReview'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/portal/hooks/usePortalAppEvent', () => ({ usePortalAppEvent: jest.fn() }))
jest.mock('../../DocumentReview', () => ({ DocumentReview: ({ review, canRespond }: { review: { title: string }; canRespond: boolean }) => <p data-testid="saved-post" data-can-respond={String(canRespond)}>{review.title}</p> }))
jest.mock('@open-mercato/ui/backend/detail', () => ({ LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>, ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p> }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: function ResponseForm({ onSubmit, initialValues }: { onSubmit: (values: Record<string, unknown>) => Promise<void>; initialValues: Record<string, unknown> }) {
    const [failed, setFailed] = React.useState(false)
    return <div>
      <p data-testid="initial-values">{JSON.stringify(initialValues)}</p>
      {failed ? <p>retry response</p> : null}
      <button type="button" onClick={() => { void onSubmit({ kind: 'approval', approveContent: true }).catch(() => setFailed(true)) }}>Approve content</button>
    </div>
  },
}))

const projection = { ok: true, canRespond: true, review: {
  caseId: 'case', post: { caseId: 'case', documentId: 'post', versionId: 'v1', version: '1.0', templateId: 'WZR-POST', title: 'Saved post', html: '<p>Saved post</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' },
} }
const response = (result: unknown, status = 200) => ({ ok: status < 300, status, result, response: {} as Response, cacheStatus: null })
beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: jest.fn(() => 'event-1') })
})

test('starts without automatic approval and retries one exact response', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response(projection)).mockResolvedValueOnce(response({}, 500))
    .mockResolvedValueOnce(response({ requestId: 'request', status: 'response_received' }))
  render(<PostReview taskId="task" orgSlug="acme" canComplete taskStatus="PENDING" />)
  expect(await screen.findByTestId('saved-post')).toHaveAttribute('data-can-respond', 'false')
  expect(JSON.parse(screen.getByTestId('initial-values').textContent!)).toMatchObject({ approveContent: false })
  fireEvent.click(screen.getByRole('button', { name: 'Approve content' }))
  await screen.findByText('retry response')
  fireEvent.click(screen.getByRole('button', { name: 'Approve content' }))
  await screen.findByText('agency.postReview.received')
  const writes = jest.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body)
  expect(JSON.parse(writes[0][1]?.body as string)).toMatchObject({ approveContent: true, post: { documentId: 'post', versionId: 'v1' } })
  expect(screen.queryByRole('button', { name: 'Approve content' })).toBeNull()
})

test('completed native task shows content-only review without reopening approval', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...projection, canRespond: false, review: { ...projection.review, post: {
    ...projection.review.post, status: 'approved', acceptanceReceipt: { acceptedAt: '2026-09-19T12:30:00.000Z' },
  } } }))
  render(<PostReview taskId="task" orgSlug="acme" canComplete taskStatus="COMPLETED" />)
  expect(await screen.findByTestId('saved-post')).toHaveAttribute('data-can-respond', 'false')
  expect(screen.getByText('agency.postReview.contentOnly')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Approve content' })).toBeNull()
})


