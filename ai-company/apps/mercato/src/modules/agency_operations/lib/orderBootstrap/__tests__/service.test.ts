/** @jest-environment node */
import type { AwilixContainer } from 'awilix'
import { SalesOrder, SalesPayment, SalesQuote } from '@open-mercato/core/modules/sales/data/entities'
import { GatewayTransaction } from '@open-mercato/core/modules/payment_gateways/data/entities'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createDemoPurchaseService, purchaseReceipt } from '../service'
import { createNativeDemoSales, purchaseRequestHash, type PurchaseBinding } from '../nativeSales'
import { createDemoPaymentGateway, isVerifiedDemoCapture } from '../payment'
import { demoOffer } from '../demoOffer'
import { createPaidCaseAnalysisBootstrap, createPaidCaseAnalysisReader } from '../../paidCaseAnalysis/bootstrap'
import { dispatchPaymentConfirmation } from '../../paymentConfirmation/dispatch'
import { preparePaymentException } from '../paymentException'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn(), findWithDecryption: jest.fn() }))
jest.mock('../configure', () => ({ readDemoPurchaseConfiguration: jest.fn(async () => ({})) }))
jest.mock('../activate', () => ({ createActivatePaidPurchase: jest.fn() }))
jest.mock('../nativeSales', () => ({ ...jest.requireActual('../nativeSales'), createNativeDemoSales: jest.fn() }))
jest.mock('../payment', () => ({ ...jest.requireActual('../payment'), createDemoPaymentGateway: jest.fn() }))
jest.mock('../../paidCaseAnalysis/bootstrap', () => ({ createPaidCaseAnalysisBootstrap: jest.fn(), createPaidCaseAnalysisReader: jest.fn() }))
jest.mock('../../paymentConfirmation/dispatch', () => ({ dispatchPaymentConfirmation: jest.fn() }))
jest.mock('../paymentException', () => ({ preparePaymentException: jest.fn(async () => null) }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const identity = { tenantId: uuid(1), organizationId: uuid(2), customerEntityId: uuid(3), customerUserId: uuid(4) }
const input = { requestId: uuid(5), offerVersion: demoOffer.offerVersion, termsVersion: demoOffer.termsVersion, acceptedTerms: true as const,
  buyer: { brandDisplayName: 'Agency client', brandWebsiteUrl: 'https://example.test', market: 'PL', language: 'pl',
    contactName: 'Client', contactEmail: 'client@example.test', billingBuyerType: 'company' as const, billingLegalName: 'Client company',
    billingCountry: 'PL', billingAddress: 'Example address', billingTaxId: 'DEMO', officialSocialUrl: '', purchaseGoal: 'Demo' } }
const em = { fork: () => em, transactional: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn(em)) }
const container = { resolve: (name: string) => name === 'em' ? em : undefined } as unknown as AwilixContainer
let order: SalesOrder, payment: SalesPayment, transaction: GatewayTransaction
const ensureOrder = jest.fn(), ensurePayment = jest.fn(), loadOrder = jest.fn(), loadPayment = jest.fn(), reconcileCaptured = jest.fn(), saveActivation = jest.fn(), savePaymentConfirmation = jest.fn()
const readGateway = jest.fn(), ensureSession = jest.fn(), retrySession = jest.fn(), confirmGateway = jest.fn(), activate = jest.fn()
const startPaidAnalysis = jest.fn(), readPaidAnalysis = jest.fn()
const previousFlag = process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED

beforeEach(() => {
  jest.clearAllMocks()
  process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = 'true'
  jest.mocked(createPaidCaseAnalysisBootstrap).mockReturnValue(startPaidAnalysis)
  jest.mocked(createPaidCaseAnalysisReader).mockReturnValue(readPaidAnalysis)
  startPaidAnalysis.mockResolvedValue({ state: 'waiting_configuration', reason: 'execution_disabled' })
  readPaidAnalysis.mockResolvedValue({ state: 'waiting_configuration', reason: 'execution_disabled' })
  jest.mocked(dispatchPaymentConfirmation).mockImplementation(async (confirmationInput, saveOutcome) => {
    const outcome = { ...confirmationInput.attempt, status: 'sent' as const, sentAt: '2026-09-19T12:01:00.000Z' }
    await saveOutcome(outcome)
    return outcome
  })
  const binding: PurchaseBinding = { requestId: input.requestId, requestHash: purchaseRequestHash(input), customerUserId: identity.customerUserId,
    reservedCaseId: uuid(9), originalPurchase: input, termsAcceptedAt: new Date().toISOString(), offerVersion: demoOffer.offerVersion,
    termsVersion: demoOffer.termsVersion, amount: demoOffer.amount, currencyCode: demoOffer.currency, provider: demoOffer.provider,
    acceptedOffer: structuredClone(demoOffer) }
  order = Object.assign(new SalesOrder(), { id: uuid(6), ...identity, currencyCode: 'PLN', grandTotalGrossAmount: '2500', metadata: { agencyPurchase: binding } })
  payment = Object.assign(new SalesPayment(), { id: uuid(7), order, ...identity, amount: '2500', capturedAmount: '0', currencyCode: 'PLN' })
  transaction = Object.assign(new GatewayTransaction(), { id: uuid(8), ...identity, paymentId: payment.id,
    providerKey: demoOffer.provider, providerSessionId: 'mock_session', amount: '2500', currencyCode: 'PLN', unifiedStatus: 'pending', capturedAmount: '0' })
  jest.mocked(findOneWithDecryption).mockResolvedValue({ id: identity.customerUserId } as never)
  ensureOrder.mockImplementation(async () => order)
  loadOrder.mockImplementation(async () => order)
  ensurePayment.mockImplementation(async () => payment)
  loadPayment.mockImplementation(async () => payment)
  readGateway.mockImplementation(async () => transaction)
  ensureSession.mockImplementation(async () => transaction)
  confirmGateway.mockImplementation(async () => { transaction.unifiedStatus = 'captured'; transaction.capturedAmount = '2500'; return transaction })
  reconcileCaptured.mockImplementation(async () => { payment.capturedAmount = '2500' })
  activate.mockResolvedValue({ caseId: uuid(9), workflowInstanceId: uuid(10) })
  saveActivation.mockImplementation(async (_orderId, activated) => {
    order.metadata = { ...order.metadata, agencyPurchase: { ...order.metadata?.agencyPurchase as object, ...activated } }
    return order
  })
  savePaymentConfirmation.mockImplementation(async (_orderId, confirmation) => {
    order.metadata = { ...order.metadata, agencyPurchase: { ...order.metadata?.agencyPurchase as object, paymentConfirmation: confirmation } }
    return order
  })
  jest.mocked(createNativeDemoSales).mockReturnValue({ ensureOrder, loadOrder, ensurePayment, loadPayment, reconcileCaptured, saveActivation, savePaymentConfirmation })
  jest.mocked(createDemoPaymentGateway).mockReturnValue({ read: readGateway, ensureSession, retrySession, confirm: confirmGateway })
})

afterAll(() => {
  if (previousFlag === undefined) delete process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED
  else process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = previousFlag
})

test('starts a pending native payment, never activating on initiation', async () => {
  const service = createDemoPurchaseService(container, activate)
  expect(await service.start(identity, input)).toMatchObject({ orderId: order.id, paymentId: payment.id, status: 'pending_payment', caseId: null })
  expect(activate).not.toHaveBeenCalled()
  expect(em.transactional).toHaveBeenCalledTimes(1)
})

test('failed-payment retry keeps the purchase identity and never activates before capture', async () => {
  const service = createDemoPurchaseService(container, activate)
  const acceptedOffer = { ...structuredClone(demoOffer), terms: { en: 'Original accepted terms', pl: 'Pierwotnie przyjęte warunki' } }
  order.metadata = { agencyPurchase: { ...order.metadata?.agencyPurchase as object, acceptedOffer } }
  transaction.unifiedStatus = 'failed'
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'blocked', canRetryPayment: true, canConfirmPayment: false })
  const replacement = Object.assign(new GatewayTransaction(), transaction, { id: uuid(30), providerSessionId: 'replacement_session', unifiedStatus: 'pending' })
  retrySession.mockResolvedValue(replacement)
  expect(await service.retryPayment(identity, order.id, { providerSessionId: 'mock_session' })).toMatchObject({
    orderId: order.id, paymentId: payment.id, status: 'pending_payment', providerSessionId: 'replacement_session', caseId: null,
    purchaseHistory: { state: 'available', offer: acceptedOffer },
  })
  expect(retrySession).toHaveBeenCalledWith(order, payment, 'mock_session')
  expect(ensureOrder).not.toHaveBeenCalled()
  expect(ensurePayment).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
  expect(reconcileCaptured).not.toHaveBeenCalled()
  await expect(service.retryPayment({ ...identity, customerUserId: uuid(90) }, order.id, { providerSessionId: 'mock_session' })).rejects.toThrow()
  order.metadata = { agencyPurchase: { ...order.metadata?.agencyPurchase as object, caseId: uuid(9), workflowInstanceId: uuid(10) } }
  await expect(service.retryPayment(identity, order.id, { providerSessionId: 'mock_session' })).rejects.toMatchObject({ status: 409 })
  expect(retrySession).toHaveBeenCalledTimes(1)
})

test('scoped purchase read returns saved terms even unpaid, while a foreign customer cannot read them', async () => {
  const acceptedOffer = { ...structuredClone(demoOffer), name: 'Purchased name', terms: { en: 'Historical English terms', pl: 'Historyczne polskie warunki' } }
  order.metadata = { agencyPurchase: { ...order.metadata?.agencyPurchase as object, acceptedOffer } }
  const service = createDemoPurchaseService(container, activate)
  expect(await service.read(identity, order.id)).toMatchObject({ status: 'pending_payment', purchaseHistory: { state: 'available', offer: acceptedOffer } })
  await expect(service.read({ ...identity, customerUserId: uuid(90) }, order.id)).rejects.toMatchObject({ status: 404 })
})

test('native pending payment leaves its amount unallocated until verified capture reconciliation', async () => {
  const { createNativeDemoSales: createNativeSales } = jest.requireActual<typeof import('../nativeSales')>('../nativeSales')
  const execute = jest.fn(async () => ({ result: { paymentId: payment.id } }))
  const nativeContainer = { resolve: (name: string) => name === 'commandBus' ? { execute } : em } as unknown as AwilixContainer
  const sales = createNativeSales(nativeContainer, { ...identity, executionUserId: uuid(11),
    paymentMethodId: uuid(12), pendingPaymentStatusId: uuid(13), capturedPaymentStatusId: uuid(14) } as never)
  jest.mocked(findOneWithDecryption).mockResolvedValueOnce(null).mockResolvedValueOnce(payment)

  await sales.ensurePayment(order)
  expect(execute).toHaveBeenNthCalledWith(1, 'sales.payments.create', expect.objectContaining({ input: expect.objectContaining({
    orderId: order.id, amount: 2500, currencyCode: 'PLN', capturedAmount: 0,
    allocations: [{ orderId: order.id, amount: 0, currencyCode: 'PLN' }],
  }) }))
  await sales.reconcileCaptured(payment)
  expect(execute).toHaveBeenNthCalledWith(2, 'sales.payments.update', expect.objectContaining({ input: expect.objectContaining({
    id: payment.id, capturedAmount: 2500, statusEntryId: uuid(14),
    allocations: [{ orderId: order.id, amount: 2500, currencyCode: 'PLN' }],
  }) }))
})

test('native order metadata records the confirmation outcome without replacing purchase evidence', async () => {
  const { createNativeDemoSales: createNativeSales } = jest.requireActual<typeof import('../nativeSales')>('../nativeSales')
  const execute = jest.fn(async () => ({ result: {} }))
  const nativeContainer = { resolve: (name: string) => name === 'commandBus' ? { execute } : em } as unknown as AwilixContainer
  const sales = createNativeSales(nativeContainer, { ...identity, executionUserId: uuid(11) } as never)
  jest.mocked(findOneWithDecryption).mockResolvedValue(order)
  const confirmation = { status: 'sent' as const, paymentId: payment.id, providerTransactionId: transaction.id,
    attemptedAt: '2026-09-19T12:00:00.000Z', sentAt: '2026-09-19T12:01:00.000Z' }

  await sales.savePaymentConfirmation(order.id, confirmation)

  expect(execute).toHaveBeenCalledWith('sales.orders.update', expect.objectContaining({ input: {
    id: order.id,
    metadata: expect.objectContaining({ agencyPurchase: expect.objectContaining({
      requestId: input.requestId, originalPurchase: input, paymentConfirmation: confirmation,
    }) }),
  } }))
})

test.each(['order', 'quote'] as const)('recovers a purchase from decrypted %s metadata without filtering encrypted JSON', async (kind) => {
  const { createNativeDemoSales: createNativeSales } = jest.requireActual<typeof import('../nativeSales')>('../nativeSales')
  const execute = jest.fn()
  const nativeContainer = { resolve: (name: string) => name === 'commandBus' ? { execute } : em } as unknown as AwilixContainer
  const channelId = uuid(20)
  const sales = createNativeSales(nativeContainer, { ...identity, executionUserId: uuid(11), channelId } as never)
  const existing = kind === 'order' ? order : Object.assign(new SalesQuote(), order)
  const binding = order.metadata?.agencyPurchase as PurchaseBinding
  const candidates = [
    { ...existing, metadata: { agencyPurchase: { ...binding, requestId: uuid(21) } } },
    { ...existing, metadata: { agencyPurchase: { ...binding, customerUserId: uuid(22) } } },
    existing,
  ]
  jest.mocked(findWithDecryption).mockImplementation(async (_em, entity) =>
    entity === (kind === 'order' ? SalesOrder : SalesQuote) ? candidates as never : [])
  jest.mocked(findOneWithDecryption).mockResolvedValue(order)

  expect(await sales.ensureOrder(identity, input)).toBe(order)
  expect(execute).not.toHaveBeenCalled()
  const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
  for (const call of jest.mocked(findWithDecryption).mock.calls) {
    expect(call[2]).toEqual({ ...scope, customerEntityId: identity.customerEntityId, channelId, deletedAt: null })
    expect(call[4]).toEqual(scope)
  }
})

test('disabled demo and inactive customers cannot create native records', async () => {
  const service = createDemoPurchaseService(container, activate)
  process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = 'false'
  await expect(service.start(identity, input)).rejects.toThrow()
  process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED = 'true'
  jest.mocked(findOneWithDecryption).mockResolvedValue(null)
  await expect(service.start(identity, input)).rejects.toThrow()
  expect(ensureOrder).not.toHaveBeenCalled()
})

test('rejects changed terms or reusing a request ID for different purchase details', async () => {
  const service = createDemoPurchaseService(container, activate)
  await expect(service.start(identity, { ...input, termsVersion: 'old' })).rejects.toThrow()
  await expect(service.start(identity, { ...input, buyer: { ...input.buyer, market: 'different' } })).rejects.toThrow()
  expect(ensurePayment).not.toHaveBeenCalled()
})

test('capture reconciles the native ledger then activates once across confirmation retries', async () => {
  const service = createDemoPurchaseService(container, activate)
  expect(await service.confirm(identity, order.id)).toMatchObject({ status: 'paid', caseId: uuid(9), workflowInstanceId: uuid(10) })
  expect(await service.confirm(identity, order.id)).toMatchObject({ status: 'paid', caseId: uuid(9) })
  expect(activate).toHaveBeenCalledTimes(1)
  expect(activate).toHaveBeenCalledWith(expect.objectContaining({ caseId: uuid(9), originalPurchase: input, orderId: order.id, paymentId: payment.id }))
  expect(reconcileCaptured.mock.invocationCallOrder[0]).toBeLessThan(activate.mock.invocationCallOrder[0])
  expect(startPaidAnalysis).toHaveBeenCalledTimes(2)
  expect(dispatchPaymentConfirmation).toHaveBeenCalledTimes(1)
  expect(dispatchPaymentConfirmation).toHaveBeenCalledWith(expect.objectContaining({
    orderId: order.id, packageName: demoOffer.name, recipientEmail: input.buyer.contactEmail,
    attempt: expect.objectContaining({ paymentId: payment.id, providerTransactionId: transaction.id }),
  }), expect.any(Function))
})

test('confirmation delivery failure remains explicit without blocking paid-case preparation', async () => {
  jest.mocked(dispatchPaymentConfirmation).mockImplementationOnce(async (confirmationInput, saveOutcome) => {
    const outcome = { ...confirmationInput.attempt, status: 'failed' as const,
      failedAt: '2026-09-19T12:02:00.000Z', reason: 'delivery_failed' as const }
    await saveOutcome(outcome)
    return outcome
  })
  await expect(createDemoPurchaseService(container, activate).confirm(identity, order.id)).resolves.toMatchObject({
    status: 'paid',
    confirmation: { status: 'failed', reason: 'delivery_failed' },
    processing: { state: 'waiting_configuration' },
  })
  expect(activate).toHaveBeenCalledTimes(1)
  expect(startPaidAnalysis).toHaveBeenCalledTimes(1)
})

test('missing historical package content records waiting input without inventing confirmation copy', async () => {
  const binding = order.metadata?.agencyPurchase as PurchaseBinding
  order.metadata = { agencyPurchase: { ...binding, acceptedOffer: undefined } }
  await expect(createDemoPurchaseService(container, activate).confirm(identity, order.id)).resolves.toMatchObject({
    status: 'paid', confirmation: { status: 'waiting_input', reason: 'purchase_content_unavailable' },
  })
  expect(dispatchPaymentConfirmation).not.toHaveBeenCalled()
  expect(startPaidAnalysis).toHaveBeenCalledTimes(1)
})

test('paid processing dispatch is after payment transaction commit; GET only reads its status', async () => {
  let transactionOpen = false
  em.transactional.mockImplementationOnce(async (fn) => {
    transactionOpen = true
    const result = await fn(em)
    transactionOpen = false
    return result
  })
  startPaidAnalysis.mockImplementationOnce(async () => {
    expect(transactionOpen).toBe(false)
    return { state: 'started', workflowInstanceId: uuid(20), nativeStatus: 'WAITING_FOR_ACTIVITIES', replayed: false }
  })
  const service = createDemoPurchaseService(container, activate)
  expect(await service.confirm(identity, order.id)).toMatchObject({ status: 'paid', processing: { state: 'started', workflowInstanceId: uuid(20) } })
  expect(await service.read(identity, order.id)).toMatchObject({ status: 'paid', processing: { state: 'waiting_configuration', reason: 'execution_disabled' } })
  expect(startPaidAnalysis).toHaveBeenCalledTimes(1)
  expect(readPaidAnalysis).toHaveBeenCalledWith(identity, order.id)
})

test('a confirmation retry after activation failure reuses the reserved case identity', async () => {
  const service = createDemoPurchaseService(container, activate)
  activate.mockRejectedValueOnce(new Error('temporary failure'))
  await expect(service.confirm(identity, order.id)).rejects.toThrow('temporary failure')
  expect(dispatchPaymentConfirmation).toHaveBeenCalledTimes(1)
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'blocked', canConfirmPayment: true })
  expect(await service.confirm(identity, order.id)).toMatchObject({ status: 'paid', caseId: uuid(9) })
  expect(activate.mock.calls.map(([value]) => value.caseId)).toEqual([uuid(9), uuid(9)])
  expect(dispatchPaymentConfirmation).toHaveBeenCalledTimes(1)
})

test('a cancelled payment returns its real receipt without confirmation or service activation', async () => {
  transaction.unifiedStatus = 'cancelled'
  const receipt = await createDemoPurchaseService(container, activate).confirm(identity, order.id)
  expect(receipt).toMatchObject({ orderId: order.id, paymentId: payment.id, status: 'blocked',
    canConfirmPayment: false, canRetryPayment: false, reason: 'Native test payment is cancelled.', caseId: null })
  expect(confirmGateway).not.toHaveBeenCalled()
  expect(reconcileCaptured).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
  expect(startPaidAnalysis).not.toHaveBeenCalled()
})

test('a payment mismatch stays blocked and sends its employee exception only after commit; GET never dispatches', async () => {
  let transactionOpen = false
  em.transactional.mockImplementationOnce(async (fn) => {
    transactionOpen = true
    const result = await fn(em)
    transactionOpen = false
    return result
  })
  const dispatch = jest.fn(async () => { expect(transactionOpen).toBe(false) })
  jest.mocked(preparePaymentException).mockResolvedValueOnce(dispatch)
  transaction.amount = '2400'
  const service = createDemoPurchaseService(container, activate)
  await expect(service.confirm(identity, order.id)).resolves.toMatchObject({ status: 'blocked', caseId: null, canConfirmPayment: false })
  expect(preparePaymentException).toHaveBeenCalledWith(container, em, order, payment, transaction)
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(confirmGateway).not.toHaveBeenCalled()
  expect(reconcileCaptured).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
  expect(startPaidAnalysis).not.toHaveBeenCalled()
  expect(dispatchPaymentConfirmation).not.toHaveBeenCalled()
  await service.read(identity, order.id)
  expect(preparePaymentException).toHaveBeenCalledTimes(1)
})

test('retry of a mismatched transaction records an exception instead of replacing or activating it', async () => {
  transaction.unifiedStatus = 'failed'
  transaction.currencyCode = 'EUR'
  await expect(createDemoPurchaseService(container, activate).retryPayment(identity, order.id, { providerSessionId: 'mock_session' }))
    .resolves.toMatchObject({ status: 'blocked', caseId: null, canConfirmPayment: false })
  expect(preparePaymentException).toHaveBeenCalledWith(container, em, order, payment, transaction)
  expect(retrySession).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})

test('confirmation eligibility follows actual session and verified capture, not a generic blocked label', () => {
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'pending_payment', canConfirmPayment: true })
  transaction.providerSessionId = null
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'pending_payment', canConfirmPayment: false })
  expect(purchaseReceipt(order, payment, null)).toMatchObject({ canConfirmPayment: false })
  transaction.providerSessionId = 'mock_session'
  transaction.unifiedStatus = 'captured'; transaction.capturedAmount = '2499'
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'blocked', canConfirmPayment: false })
  transaction.capturedAmount = '2500'
  expect(purchaseReceipt(order, payment, transaction)).toMatchObject({ status: 'blocked', canConfirmPayment: true })
})

test('direct teammate activation launches once after commit and returns current processing without a second bootstrap', async () => {
  let transactionOpen = false
  em.transactional.mockImplementationOnce(async (fn) => {
    transactionOpen = true
    const result = await fn(em)
    transactionOpen = false
    return result
  })
  const launch = jest.fn(async () => { expect(transactionOpen).toBe(false) })
  activate.mockResolvedValueOnce({ caseId: uuid(9), workflowInstanceId: uuid(10), launch })
  readPaidAnalysis.mockResolvedValue({ state: 'started', workflowInstanceId: uuid(10), nativeStatus: 'WAITING_FOR_ACTIVITIES', replayed: true })
  expect(await createDemoPurchaseService(container, activate).confirm(identity, order.id)).toMatchObject({
    status: 'paid', processing: { state: 'started', workflowInstanceId: uuid(10) },
  })
  expect(launch).toHaveBeenCalledTimes(1)
  expect(startPaidAnalysis).not.toHaveBeenCalled()
  expect(saveActivation).toHaveBeenCalledWith(order.id, { caseId: uuid(9), workflowInstanceId: uuid(10) })
})

test('foreign ownership and mismatched native payment cannot activate', async () => {
  const service = createDemoPurchaseService(container, activate)
  await expect(service.confirm({ ...identity, customerUserId: uuid(90) }, order.id)).rejects.toThrow()
  transaction.amount = '25'
  expect(await service.confirm(identity, order.id)).toMatchObject({ status: 'blocked' })
  expect(confirmGateway).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})

test.each(['pending', 'authorized', 'refunded', 'failed'])('native %s is not paid authority', (status) => {
  transaction.unifiedStatus = status
  transaction.capturedAmount = '2500'
  expect(isVerifiedDemoCapture(order, payment, transaction)).toBe(false)
  expect(purchaseReceipt(order, payment, transaction).status).not.toBe('paid')
})

test('partial capture and foreign payment identity are rejected', () => {
  transaction.unifiedStatus = 'captured'
  transaction.capturedAmount = '2499'
  expect(isVerifiedDemoCapture(order, payment, transaction)).toBe(false)
  transaction.capturedAmount = '2500'
  transaction.paymentId = uuid(99)
  expect(isVerifiedDemoCapture(order, payment, transaction)).toBe(false)
})
