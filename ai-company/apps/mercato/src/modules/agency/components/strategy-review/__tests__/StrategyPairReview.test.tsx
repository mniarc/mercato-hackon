/** @jest-environment jsdom */
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StrategyPairReview } from '../StrategyPairReview'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => (key: string) => key }))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))
jest.mock('@open-mercato/ui/portal/hooks/usePortalAppEvent', () => ({ usePortalAppEvent: jest.fn() }))
jest.mock('../../DocumentReview', () => ({
  DocumentReview: ({ review, canRespond }: { review: { title: string; versionId: string; status: string }; canRespond: boolean }) =>
    <div data-testid={review.versionId} data-can-respond={String(canRespond)} data-status={review.status}>{review.title}</div>,
}))
jest.mock('@open-mercato/ui/backend/detail', () => ({
  LoadingMessage: ({ label }: { label: string }) => <p>{label}</p>,
  ErrorMessage: ({ label }: { label: string }) => <p role="alert">{label}</p>,
}))
jest.mock('@open-mercato/ui/backend/CrudForm', () => ({
  CrudForm: function ResponseForm({ onSubmit, fields }: { onSubmit: (values: Record<string, unknown>) => Promise<void>; fields: { id: string }[] }) {
    const [failed, setFailed] = React.useState(false)
    const submit = (values: Record<string, unknown>) => { void onSubmit(values).catch(() => setFailed(true)) }
    return <div>
      {failed ? <p>retry response</p> : null}
      {fields.some((field) => field.id === 'strategy') ? <button type="button" onClick={() => submit({ kind: 'approval', strategy: true, tov: false })}>Approve strategy</button> : null}
      {fields.some((field) => field.id === 'tov') ? <button type="button" onClick={() => submit({ kind: 'approval', tov: true })}>Approve tone of voice</button> : null}
      <button type="button" onClick={() => submit({ kind: 'message', body: 'Please change the tone.' })}>Send comments</button>
    </div>
  },
}))

const document = {
  caseId: 'case-1', version: '2.0', html: '<h1>Actual document</h1>',
  status: 'ready_for_review', isCurrent: true, mode: 'content',
}
const projection = {
  ok: true, canRespond: true, review: {
    caseId: 'case-1',
    strategy: { ...document, title: 'Saved strategy', templateId: 'WZR-STRATEGIA', documentId: 'strategy-document', versionId: 'strategy-v2' },
    tov: { ...document, title: 'Saved tone of voice', templateId: 'WZR-TOV', documentId: 'tov-document', versionId: 'tov-v2' },
  },
}
function response(result: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, result, response: {} as Response, cacheStatus: null }
}
function mount(props: Partial<React.ComponentProps<typeof StrategyPairReview>> = {}) {
  return render(<StrategyPairReview taskId="pair-task" orgSlug="acme" canComplete taskStatus="PENDING" {...props} />)
}
beforeEach(() => {
  jest.mocked(apiCall).mockReset()
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: jest.fn(() => 'pair-event-1') })
})

test('uses read-only teammate viewers and preserves one exact paired response across retry', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response(projection))
    .mockResolvedValueOnce(response({ error: 'temporary' }, 500))
    .mockResolvedValueOnce(response({ requestId: 'request-1', status: 'response_received' }))
  mount()
  expect(await screen.findByTestId('strategy-v2')).toHaveAttribute('data-can-respond', 'false')
  expect(screen.getByTestId('tov-v2')).toHaveAttribute('data-can-respond', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Approve strategy' }))
  await screen.findByText('retry response')
  fireEvent.click(screen.getByRole('button', { name: 'Approve strategy' }))
  await screen.findByText('agency.strategyReview.received')
  const writes = jest.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][0]).toBe('/api/agency/strategy-reviews/pair-task')
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body)
  expect(JSON.parse(writes[0][1]?.body as string)).toEqual({
    channel: 'portal', kind: 'approval', externalEventId: 'pair-event-1',
    strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
    tov: { documentId: 'tov-document', versionId: 'tov-v2' }, approvedDocuments: ['strategy'],
  })
  expect(screen.queryByRole('button', { name: 'Approve strategy' })).toBeNull()
})

test.each([
  { canComplete: false, taskStatus: 'PENDING', projectedCanRespond: true },
  { canComplete: true, taskStatus: 'COMPLETED', projectedCanRespond: true },
  { canComplete: true, taskStatus: 'PENDING', projectedCanRespond: false },
])('requires both native task and producer authority: %j', async ({ projectedCanRespond, ...props }) => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...projection, canRespond: projectedCanRespond }))
  mount(props)
  await screen.findByTestId('strategy-v2')
  expect(screen.queryByRole('button', { name: 'Approve strategy' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Send comments' })).toBeNull()
  expect(apiCall).toHaveBeenCalledTimes(1)
})

test.each([403, 404])('does not display cached documents or a response form after denied projection (%s)', async (status) => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ error: 'unavailable' }, status))
  mount()
  await screen.findByRole('alert')
  expect(screen.queryByTestId('strategy-v2')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Send comments' })).toBeNull()
})

test('sends a message as one original paired response rather than approval', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response(projection))
    .mockResolvedValueOnce(response({ requestId: 'request-message', status: 'response_received' }))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Send comments' }))
  await waitFor(() => expect(screen.getByText('agency.strategyReview.received')).toBeTruthy())
  const write = jest.mocked(apiCall).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(write?.[1]?.body as string)).toMatchObject({
    kind: 'message', body: 'Please change the tone.',
    strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
    tov: { documentId: 'tov-document', versionId: 'tov-v2' },
  })
  expect(JSON.parse(write?.[1]?.body as string)).not.toHaveProperty('approvedDocuments')
})

test('a follow-up displays the accepted document read-only and submits only the remaining approval', async () => {
  jest.mocked(apiCall).mockResolvedValueOnce(response({ ...projection, review: {
    ...projection.review,
    strategy: { ...projection.review.strategy, status: 'approved', acceptanceReceipt: { acceptedAt: '2026-09-19T12:30:00.000Z' } },
  } })).mockResolvedValueOnce(response({ requestId: 'follow-up-request', status: 'response_received' }))
  mount({ taskId: 'follow-up-task' })
  expect(await screen.findByTestId('strategy-v2')).toHaveAttribute('data-status', 'approved')
  expect(screen.getByTestId('strategy-v2')).toHaveAttribute('data-can-respond', 'false')
  expect(screen.queryByRole('button', { name: 'Approve strategy' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Approve tone of voice' }))
  await screen.findByText('agency.strategyReview.received')
  const write = jest.mocked(apiCall).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(write?.[0]).toBe('/api/agency/strategy-reviews/follow-up-task')
  expect(JSON.parse(write?.[1]?.body as string)).toMatchObject({
    strategy: { documentId: 'strategy-document', versionId: 'strategy-v2' },
    tov: { documentId: 'tov-document', versionId: 'tov-v2' }, approvedDocuments: ['tov'],
  })
  expect(screen.queryByRole('button', { name: 'Approve tone of voice' })).toBeNull()
})
