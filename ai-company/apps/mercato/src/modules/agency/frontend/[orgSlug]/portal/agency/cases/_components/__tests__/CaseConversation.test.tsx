/** @jest-environment jsdom */

import * as React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@open-mercato/shared/lib/testing/renderWithProviders'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { ClientSubmissionItem } from '@/modules/agency_operations/lib/contracts/clientSubmission'
import { CaseConversation, canReplyToSubmission } from '../CaseConversation'
import { ClientMessageForm } from '../ClientMessageForm'
import translations from '../../../../../../../i18n/en.json'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/acme/portal/agency/cases/case-1',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('remark-gfm', () => ({ __esModule: true, default: {} }))
jest.mock('@open-mercato/ui/backend/injection/InjectionSpot', () => ({
  InjectionSpot: () => null,
  useInjectionWidgets: () => ({ widgets: [], loading: false, error: null }),
  useInjectionSpotEvents: () => ({
    triggerEvent: async (_event: string, data: Record<string, unknown>) => ({ ok: true, data }),
  }),
}))
jest.mock('@open-mercato/ui/backend/injection/useInjectionDataWidgets', () => ({
  useInjectionDataWidgets: () => ({ widgets: [], isLoading: false, error: null }),
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({
  ...jest.requireActual('@open-mercato/ui/backend/utils/apiCall'),
  apiCall: jest.fn(),
  readApiResultOrThrow: jest.fn(),
}))

const submission: ClientSubmissionItem = {
  submissionId: 'submission-1', caseId: 'case-1', eventId: 'event-1', channel: 'portal',
  submittedByCustomerUserId: 'customer-1', createdAt: '2026-09-18T12:00:00Z',
  original: { eventId: 'event-1', text: 'Original client message', scaffoldScenario: 'clarify' },
  workflow: { status: 'PAUSED', currentStep: 'client_reply' },
  disposition: {
    kind: 'clarify', source: 'deterministic_scaffold', workerId: 'agency_operations.client-triage.scaffold.v1',
    rationale: 'Deterministic fixture', message: 'Which material do you mean?',
    targets: { caseId: 'case-1', submissionId: 'submission-1' }, effectsApplied: false,
  },
}

beforeEach(() => {
  jest.resetAllMocks()
  if (typeof Response === 'undefined') Object.defineProperty(globalThis, 'Response', { value: class Response {}, configurable: true })
  let event = 0
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true, value: jest.fn(() => `event-${++event}`),
  })
})

it('preserves the original message and event ID across a failed retry, then creates a new event after success', async () => {
  const onSaved = jest.fn()
  jest.mocked(apiCall).mockRejectedValueOnce(new Error('Network failure')).mockResolvedValue({
    ok: true, status: 201, result: { item: { id: 'saved' }, replayed: false },
    response: {} as Response, cacheStatus: null,
  })
  renderWithProviders(<ClientMessageForm endpoint="/messages" formId="message" onSaved={onSaved} />, { dict: translations })
  const original = '  Keep my original text\nunchanged.  '
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: original } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await screen.findByText(translations['agency.conversation.saveError'])
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  const calls = jest.mocked(apiCall).mock.calls
  expect(calls[0][1]?.body).toEqual(calls[1][1]?.body)
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ eventId: 'event-1', text: original })
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Next message' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2))
  expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ eventId: 'event-2', text: 'Next message' })
})

it('disables submission while its request is pending', async () => {
  let resolveRequest!: (value: Awaited<ReturnType<typeof apiCall>>) => void
  jest.mocked(apiCall).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
  renderWithProviders(<ClientMessageForm endpoint="/messages" formId="message" onSaved={jest.fn()} />, { dict: translations })
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Pending message' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
  resolveRequest({ ok: true, status: 201, result: { item: submission }, response: {} as Response, cacheStatus: null })
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message' })).not.toBeDisabled())
})

it('shows persisted original, clarification and accepted reply after loading, without another reply form', async () => {
  jest.mocked(readApiResultOrThrow).mockImplementation(async (url) => String(url).endsWith('/replies') ? {
    items: [{ replyId: 'reply-1', original: { eventId: 'reply-event', text: 'The September material.' }, outcome: 'clarification_received' }],
  } : { items: [{ ...submission, workflow: { status: 'COMPLETED', currentStep: 'reply_received' } }] })
  renderWithProviders(<CaseConversation caseId="case-1" />, { dict: translations })
  expect(await screen.findByText('Original client message')).toBeInTheDocument()
  expect(await screen.findByText('Which material do you mean?')).toBeInTheDocument()
  expect(await screen.findByText('The September material.')).toBeInTheDocument()
  expect(screen.getByText(translations['agency.conversation.replyReceived'])).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Your clarification' })).not.toBeInTheDocument()
  expect(screen.getByText(translations['agency.conversation.scaffold'])).toBeInTheDocument()
})

it('shows a reply only for the owned exact clarification wait and posts to that submission', async () => {
  jest.mocked(readApiResultOrThrow).mockImplementation(async (url) => ({ items: String(url).endsWith('/replies') ? [] : [submission] }))
  jest.mocked(apiCall).mockResolvedValue({ ok: true, status: 201, result: {
    item: { replyId: 'reply-1', original: { text: 'The September material.' }, outcome: 'clarification_received' },
  }, response: {} as Response, cacheStatus: null })
  renderWithProviders(<CaseConversation caseId="case-1" />, { dict: translations })
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your clarification' }), { target: { value: 'The September material.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send clarification' }))
  await waitFor(() => expect(apiCall).toHaveBeenCalledTimes(1))
  expect(jest.mocked(apiCall).mock.calls[0][0]).toBe('/api/agency/portal/cases/case-1/submissions/submission-1/replies')
  expect(JSON.parse(String(jest.mocked(apiCall).mock.calls[0][1]?.body))).toEqual({ eventId: 'event-1', text: 'The September material.' })
  expect(canReplyToSubmission({ ...submission, workflow: { status: 'RUNNING', currentStep: 'client_reply' } })).toBe(false)
  expect(canReplyToSubmission({ ...submission, workflow: { status: 'PAUSED', currentStep: 'other_wait' } })).toBe(false)
  expect(canReplyToSubmission({ ...submission, disposition: { ...submission.disposition!, targets: { caseId: 'other-case', submissionId: 'submission-1' } } })).toBe(false)
})

it('provides a refresh after a failed load without displaying a message form for an unavailable case', async () => {
  jest.mocked(readApiResultOrThrow).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ items: [] })
  renderWithProviders(<CaseConversation caseId="case-1" />, { dict: translations })
  await screen.findByText(translations['agency.conversation.loadError'])
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }))
  expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument()
  expect(screen.getByText('No messages yet')).toBeInTheDocument()
})

it('shows a saved configuration hold without a fabricated reply or blanket scaffold disclaimer', async () => {
  jest.mocked(readApiResultOrThrow).mockResolvedValue({ items: [{ ...submission,
    workflow: null, disposition: null, processing: { state: 'waiting_configuration' },
  }] })
  renderWithProviders(<CaseConversation caseId="case-1" />, { dict: translations })
  expect(await screen.findByText(translations['agency.conversation.waitingConfiguration'])).toBeInTheDocument()
  expect(screen.getByText('Original client message')).toBeInTheDocument()
  expect(screen.queryByText(translations['agency.conversation.scaffold'])).not.toBeInTheDocument()
  expect(screen.queryByText('Which material do you mean?')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Your clarification' })).not.toBeInTheDocument()
})
