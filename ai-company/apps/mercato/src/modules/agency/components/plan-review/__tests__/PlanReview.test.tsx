/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PlanReview } from '../PlanReview'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/portal/hooks/usePortalAppEvent', () => ({ usePortalAppEvent: jest.fn() }))
jest.mock('../../DocumentReview', () => ({ DocumentReview: ({ review, canRespond }: { review: { title: string }; canRespond: boolean }) => <p data-testid="saved-plan" data-can-respond={String(canRespond)}>{review.title}</p> }))
jest.mock('@open-mercato/ui/backend/detail', () => ({ LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>, ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p> }))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: function ResponseForm({ onSubmit, initialValues }: { onSubmit: (values: Record<string, unknown>) => Promise<void>; initialValues: Record<string, unknown> }) {
    const [failed, setFailed] = React.useState(false)
    return <div>
      <p data-testid="initial-values">{JSON.stringify(initialValues)}</p>
      {failed ? <p>retry response</p> : null}
      <button type="button" onClick={() => { void onSubmit({ kind: 'approval', approvePlan: true, selectedTopicId: 'b' }).catch(() => setFailed(true)) }}>Choose B</button>
    </div>
  },
}))

const projection = { ok: true, canRespond: true, review: {
  caseId: 'case', plan: { caseId: 'case', documentId: 'plan', versionId: 'v1', version: '1.0', templateId: 'WZR-PLAN', title: 'Saved plan', html: '<p>Saved plan</p>', status: 'ready_for_review', isCurrent: true, mode: 'content' },
  topics: [{ topicId: 'a', title: 'Recommendation', recommended: true }, { topicId: 'b', title: 'Chosen topic', recommended: false }], recommendedTopicId: 'a',
} }
const response = (result: unknown, status = 200) => ({ ok: status < 300, status, result, response: {} as Response, cacheStatus: null })
beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: jest.fn(() => 'event-1') })
})

test('starts without automatic approval or selection and retries one exact response', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response(projection)).mockResolvedValueOnce(response({}, 500))
    .mockResolvedValueOnce(response({ requestId: 'request', status: 'response_received' }))
  render(<PlanReview taskId="task" orgSlug="acme" canComplete taskStatus="PENDING" />)
  expect(await screen.findByTestId('saved-plan')).toHaveAttribute('data-can-respond', 'false')
  expect(JSON.parse(screen.getByTestId('initial-values').textContent!)).toMatchObject({ approvePlan: false, selectedTopicId: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Choose B' }))
  await screen.findByText('retry response')
  fireEvent.click(screen.getByRole('button', { name: 'Choose B' }))
  await screen.findByText('agency.planReview.received')
  const writes = jest.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body)
  expect(JSON.parse(writes[0][1]?.body as string)).toMatchObject({ approvePlan: true, selectedTopicId: 'b', plan: { documentId: 'plan', versionId: 'v1' } })
  expect(screen.queryByRole('button', { name: 'Choose B' })).toBeNull()
})

test('completed native task shows saved chosen topic without reopening approval', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...projection, canRespond: false, review: { ...projection.review, selectedTopicId: 'b', plan: {
    ...projection.review.plan, status: 'approved', acceptanceReceipt: { acceptedAt: '2026-09-19T12:30:00.000Z' },
  } } }))
  render(<PlanReview taskId="task" orgSlug="acme" canComplete taskStatus="COMPLETED" />)
  expect(await screen.findByText('agency.planReview.savedTopic: Chosen topic (b)')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Choose B' })).toBeNull()
})
