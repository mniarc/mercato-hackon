import type { SendEmailOptions } from '@open-mercato/shared/lib/email/send'
import { sendEmail } from '@open-mercato/shared/lib/email/send'
import { isEmailDeliveryDisabled } from '@open-mercato/shared/lib/email/config'
import { paymentConfirmationStateSchema, type PaymentConfirmationState } from './contracts'

export type PaymentConfirmationDispatchInput = {
  tenantId: string
  organizationId: string
  orderId: string
  packageName: string
  recipientEmail: string
  language: string
  attempt: PaymentConfirmationState & { status: 'sending' }
}

type SaveOutcome = (outcome: PaymentConfirmationState) => Promise<void>
type DeliverEmail = (options: SendEmailOptions) => Promise<void>

function copy(input: Pick<PaymentConfirmationDispatchInput, 'language' | 'orderId' | 'packageName'>) {
  if (input.language.trim().toLowerCase().startsWith('pl')) {
    return {
      subject: `Potwierdzenie zakupu demonstracyjnego — zamówienie ${input.orderId}`,
      text: [
        'Potwierdzamy płatność demonstracyjną.',
        `Numer zamówienia: ${input.orderId}`,
        `Pakiet: ${input.packageName}`,
        'Rozpoczęliśmy przygotowanie usługi demonstracyjnej.',
      ].join('\n'),
    }
  }
  return {
    subject: `Demo purchase confirmation — order ${input.orderId}`,
    text: [
      'We confirmed the demo payment.',
      `Order number: ${input.orderId}`,
      `Package: ${input.packageName}`,
      'Preparation of the demo service has started.',
    ].join('\n'),
  }
}

function isConfigurationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return /(?:EMAIL|SYSTEM_EMAIL)_(?:FROM|TRANSPORT|CHANNEL|CREDENTIALS)_NOT_CONFIGURED|SYSTEM_EMAIL_CHANNEL_UNAVAILABLE/.test(message)
}

/**
 * Delivers one already-reserved confirmation attempt through Open Mercato's
 * registered system-email transport. Delivery and outcome persistence are
 * fail-soft so neither can gate the independent fulfilment branch.
 */
export async function dispatchPaymentConfirmation(
  input: PaymentConfirmationDispatchInput,
  saveOutcome: SaveOutcome,
  deliverEmail: DeliverEmail = sendEmail,
  deliveryDisabled: () => boolean = isEmailDeliveryDisabled,
): Promise<PaymentConfirmationState> {
  const message = copy(input)
  let outcome: PaymentConfirmationState
  if (deliveryDisabled()) {
    outcome = paymentConfirmationStateSchema.parse({
      ...input.attempt,
      status: 'waiting_configuration',
      failedAt: new Date().toISOString(),
      reason: 'delivery_disabled',
    })
  } else {
    try {
      await deliverEmail({
        to: input.recipientEmail,
        subject: message.subject,
        text: message.text,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      })
      outcome = paymentConfirmationStateSchema.parse({
        ...input.attempt,
        status: 'sent',
        sentAt: new Date().toISOString(),
      })
    } catch (error) {
      const waiting = isConfigurationFailure(error)
      outcome = paymentConfirmationStateSchema.parse({
        ...input.attempt,
        status: waiting ? 'waiting_configuration' : 'failed',
        failedAt: new Date().toISOString(),
        reason: waiting ? 'delivery_configuration_unavailable' : 'delivery_failed',
      })
    }
  }

  try {
    await saveOutcome(outcome)
    return outcome
  } catch {
    // A provider success without a saved outcome must never be reported as a
    // recorded delivery or retried automatically. The reserved state remains
    // `sending`, which truthfully requires operator reconciliation.
    return input.attempt
  }
}
