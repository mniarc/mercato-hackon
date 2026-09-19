/** @jest-environment node */
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyResearchDocument, AgencyResearchDocumentVersion } from '../../../data/entities'
import { startTaskRun, saveDocumentVersion, finishTaskRun } from '../../store'
import { readPublicationTarget } from '../../publicationConsent/read'
import { configurePublicationDestination } from '../configure'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
jest.mock('../../store', () => ({ startTaskRun: jest.fn(), saveDocumentVersion: jest.fn(), finishTaskRun: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { tenantId: uuid(1), organizationId: uuid(2) }
const input = { context: { ...scope, userId: uuid(3) }, request: { orderRef: uuid(4), nativeChannelId: uuid(5), credentialsRef: uuid(6),
  accountId: '123456789012345679', channelId: '123456789012345678', displayName: 'Demo channel' } }
const em = { transactional: (work: (tx: EntityManager) => Promise<unknown>) => work(em as never) } as unknown as EntityManager
let rows: AgencyResearchDocumentVersion[]
let hasBrief: boolean

beforeEach(() => {
  jest.clearAllMocks(); hasBrief = true
  rows = [Object.assign(new AgencyResearchDocumentVersion(), { ...scope, orderRef: input.request.orderRef, id: uuid(10), documentId: uuid(11),
    templateId: 'WZR-ZAMOWIENIE', versionNo: 1, status: 'approved', data: {
      product_selection: { sku: 'configured', offer_version: '1', price_net: 1, currency: 'PLN' },
      brand: { display_name: 'Brand', website_url: 'https://example.test' }, market_language: { market: 'UK', language: 'en' },
      official_social: { platform: 'LinkedIn', url: 'https://linkedin.com/company/brand' },
    } })]
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity, query) => {
    const documents = [...new Map(rows.map((row) => [row.templateId, { ...scope, orderRef: input.request.orderRef,
      templateId: row.templateId, id: row.documentId, currentVersionId: row.id, deletedAt: null }])).values()]
    if (hasBrief) documents.push({ ...scope, orderRef: input.request.orderRef, templateId: 'WZR-BRIEF', id: uuid(12), currentVersionId: uuid(13), deletedAt: null })
    const candidates = entity === AgencyResearchDocument ? documents : rows
    return (candidates.find((row) => Object.entries(query as Record<string, unknown>).every(([key, value]) => Reflect.get(row, key) === value)) ?? null) as never
  })
  jest.mocked(startTaskRun).mockImplementation(async () => ({ id: uuid(20) }) as never)
  jest.mocked(saveDocumentVersion).mockImplementation(async (_em, tenantScope, data) => {
    const previous = rows.filter((row) => row.templateId === data.templateId)
    const version = Object.assign(new AgencyResearchDocumentVersion(), { ...tenantScope, ...data,
      documentId: uuid(30), id: uuid(40 + previous.length), versionNo: previous.length + 1 })
    rows.push(version)
    return { version } as never
  })
})

it('saves a real exact target readable by consent while leaving access unverified and existing order untouched', async () => {
  const originalOrder = structuredClone(rows[0].data)
  const result = await configurePublicationDestination(em, input)
  expect(result).toMatchObject({ status: 'configured', readiness: 'not_verified', canSend: false, replayed: false })
  expect(await readPublicationTarget(em, scope, input.request.orderRef)).toMatchObject({ platform: 'Discord',
    configVersionId: uuid(40), accountId: input.request.accountId, channelId: input.request.channelId })
  expect(jest.mocked(saveDocumentVersion).mock.calls[0][2]).toMatchObject({ templateId: 'WZR-KONFIG-PUBLIKACJI', status: 'blocked',
    data: { connection_validation: { state: 'not_executed', evidence_ref_or_null: null },
      capabilities: { can_publish_text: 'unknown', can_read_result: 'unknown' }, readiness: { state: 'not_ready' } } })
  expect(rows[0].data).toEqual(originalOrder)
  await expect(configurePublicationDestination(em, input)).resolves.toMatchObject({ replayed: true, configVersionId: uuid(40) })
  expect(saveDocumentVersion).toHaveBeenCalledTimes(1)
})

it('changes the destination by appending a version and refuses incomplete case research without writes', async () => {
  await configurePublicationDestination(em, input)
  const previous = structuredClone(rows[1].data)
  await expect(configurePublicationDestination(em, { ...input, request: { ...input.request, channelId: '223456789012345678' } })).resolves.toMatchObject({ configVersionId: uuid(41), replayed: false })
  expect(rows[1].data).toEqual(previous)
  expect(await readPublicationTarget(em, scope, input.request.orderRef)).toMatchObject({ channelId: '223456789012345678' })
  hasBrief = false
  await expect(configurePublicationDestination(em, input)).resolves.toMatchObject({ status: 'not_ready', reason: 'order_not_ready', canSend: false })
  expect(saveDocumentVersion).toHaveBeenCalledTimes(2)
})
