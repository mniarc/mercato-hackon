/** @jest-environment node */
import { dispatchPaymentConfirmation } from '../dispatch'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const attempt = {
  status: 'sending' as const,
  paymentId: uuid(1),
  providerTransactionId: uuid(2),
  attemptedAt: '2026-09-19T12:00:00.000Z',
}
const input = {
  tenantId: uuid(3), organizationId: uuid(4), orderId: uuid(5), packageName: 'Saved demo package',
  recipientEmail: 'scoped-customer@example.test', language: 'pl', attempt,
}

test('delivers only saved purchase facts through the native email contract and records success afterward', async () => {
  const deliver = jest.fn().mockResolvedValue(undefined)
  const save = jest.fn().mockResolvedValue(undefined)

  await expect(dispatchPaymentConfirmation(input, save, deliver, () => false)).resolves.toMatchObject({
    ...attempt, status: 'sent', sentAt: expect.any(String),
  })
  expect(deliver).toHaveBeenCalledWith({
    to: input.recipientEmail,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    subject: expect.stringContaining(input.orderId),
    text: expect.stringMatching(new RegExp(`${input.orderId}.*${input.packageName}`, 's')),
  })
  const body = deliver.mock.calls[0][0].text as string
  expect(body).toContain('Rozpoczęliśmy przygotowanie usługi demonstracyjnej.')
  expect(body).not.toMatch(/dokument|akcept|faktur|cena|2500/i)
  expect(save.mock.invocationCallOrder[0]).toBeGreaterThan(deliver.mock.invocationCallOrder[0])
})

test.each([
  ['EMAIL_TRANSPORT_NOT_CONFIGURED: enable provider', 'waiting_configuration', 'delivery_configuration_unavailable'],
  ['SMTP refused', 'failed', 'delivery_failed'],
])('records a truthful non-success without throwing: %s', async (message, status, reason) => {
  const deliver = jest.fn().mockRejectedValue(new Error(message))
  const save = jest.fn().mockResolvedValue(undefined)
  await expect(dispatchPaymentConfirmation(input, save, deliver, () => false)).resolves.toMatchObject({ status, reason })
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ status, reason, failedAt: expect.any(String) }))
})

test('does not report provider success when its delivery outcome cannot be persisted', async () => {
  const deliver = jest.fn().mockResolvedValue(undefined)
  const save = jest.fn().mockRejectedValue(new Error('order update failed'))
  await expect(dispatchPaymentConfirmation(input, save, deliver, () => false)).resolves.toEqual(attempt)
})

test('records disabled delivery as waiting without invoking the transport', async () => {
  const deliver = jest.fn().mockResolvedValue(undefined)
  const save = jest.fn().mockResolvedValue(undefined)
  await expect(dispatchPaymentConfirmation(input, save, deliver, () => true)).resolves.toMatchObject({
    status: 'waiting_configuration', reason: 'delivery_disabled',
  })
  expect(deliver).not.toHaveBeenCalled()
})
