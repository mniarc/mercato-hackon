/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { AgencyCase } from '../../../data/entities'
import { createPublicationDestinationService } from '../service'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const context = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
const request = { caseId: uuid(4), nativeChannelId: uuid(5), discordChannelId: '123456789012345678', displayName: 'Demo channel' }
const allowed = jest.fn(), resolveCredentials = jest.fn(), configure = jest.fn(), sendMessage = jest.fn(), validateCredentials = jest.fn()
const status = jest.fn(), getPostAcceptance = jest.fn(), preparePublication = jest.fn()
let channel: CommunicationChannel
const adapter = { capabilities: { supportedBodyFormats: ['text', 'markdown'] }, sendMessage, validateCredentials }
const services: Record<string, unknown> = { em: {}, rbacService: { userHasAllFeatures: allowed },
  channelAdapterRegistry: { get: () => adapter }, integrationCredentialsService: { resolve: resolveCredentials },
  agencyResearchService: { configurePublicationDestination: configure, status, getPostAcceptance, preparePublication } }
const container = { resolve: (name: string) => services[name] } as unknown as AppContainer
const credentials = { botToken: 'private-test-token', applicationId: '123456789012345670', publicKey: 'a'.repeat(64),
  guildId: '123456789012345679', defaultChannelId: request.discordChannelId }

beforeEach(() => {
  jest.clearAllMocks()
  channel = Object.assign(new CommunicationChannel(), { ...context, id: request.nativeChannelId, providerKey: 'discord', channelType: 'discord',
    credentialsRef: uuid(6), userId: context.userId, isActive: true, status: 'connected' })
  allowed.mockResolvedValue(true); resolveCredentials.mockResolvedValue(credentials)
  configure.mockResolvedValue({ status: 'configured', canSend: false, readiness: 'not_verified' })
  status.mockResolvedValue({ documents: [] })
  getPostAcceptance.mockResolvedValue({ status: 'not_ready' })
  jest.mocked(findOneWithDecryption).mockImplementation(async (_em, entity) => {
    if (entity === AgencyCase) return { id: request.caseId } as never
    if (entity === CommunicationChannel) return channel as never
    return null
  })
})

it('binds the exact native default and credential scope without forwarding secrets or checking/sending externally', async () => {
  await expect(createPublicationDestinationService(container).configure(context, request)).resolves.toMatchObject({ status: 'configured', canSend: false, readiness: 'not_verified' })
  expect(resolveCredentials).toHaveBeenCalledWith('channel_discord', context)
  expect(configure).toHaveBeenCalledWith({ context, request: { orderRef: request.caseId, nativeChannelId: request.nativeChannelId,
    credentialsRef: uuid(6), accountId: credentials.guildId, channelId: request.discordChannelId, displayName: request.displayName } })
  expect(JSON.stringify(configure.mock.calls)).not.toContain(credentials.botToken)
  expect(sendMessage).not.toHaveBeenCalled(); expect(validateCredentials).not.toHaveBeenCalled()
})

it('preserves the prior destination when credentials are missing or the requested target is not configured', async () => {
  resolveCredentials.mockResolvedValueOnce(null)
  await expect(createPublicationDestinationService(container).configure(context, request)).resolves.toMatchObject({ status: 'not_ready', reason: 'credentials_missing', canSend: false })
  await expect(createPublicationDestinationService(container).configure(context, { ...request, discordChannelId: '223456789012345678' })).resolves.toMatchObject({ status: 'not_ready', reason: 'target_not_configured' })
  channel.isActive = false
  await expect(createPublicationDestinationService(container).configure(context, request)).resolves.toMatchObject({ status: 'not_ready', reason: 'channel_inactive' })
  expect(configure).not.toHaveBeenCalled()
})

it('requires agency permission and native personal-channel ownership before reading credentials', async () => {
  allowed.mockResolvedValueOnce(false)
  await expect(createPublicationDestinationService(container).configure(context, request)).rejects.toMatchObject({ status: 403 })
  channel.userId = uuid(99)
  await expect(createPublicationDestinationService(container).configure(context, request)).rejects.toMatchObject({ status: 404 })
  expect(resolveCredentials).not.toHaveBeenCalled(); expect(configure).not.toHaveBeenCalled()
  expect(jest.mocked(findOneWithDecryption).mock.calls.find((call) => call[1] === CommunicationChannel)?.[2]).toMatchObject({
    tenantId: context.tenantId, id: request.nativeChannelId, $or: [{ organizationId: context.organizationId }, { organizationId: null }],
  })
})

it('refreshes deterministic preparation only from the real current accepted post receipt', async () => {
  const postVersionId = uuid(70), acceptanceSubmissionId = uuid(71)
  status.mockResolvedValue({ documents: [{ templateId: 'WZR-POST', versionId: postVersionId }] })
  await createPublicationDestinationService(container).configure(context, request)
  expect(preparePublication).not.toHaveBeenCalled()
  getPostAcceptance.mockResolvedValue({ status: 'ready', orderRef: request.caseId,
    post: { versionId: postVersionId, isCurrent: true, documentStatus: 'approved', versionStatus: 'approved' },
    receipt: { documentVersionId: postVersionId, source: { submissionId: acceptanceSubmissionId } } })
  const preparation = { status: 'prepared', publicationConsent: 'missing', canSend: false }
  preparePublication.mockResolvedValue(preparation)
  await expect(createPublicationDestinationService(container).configure(context, request)).resolves.toMatchObject({ preparation, canSend: false })
  expect(preparePublication).toHaveBeenCalledWith({ context, request: { orderRef: request.caseId, postVersionId, acceptanceSubmissionId } })
  expect(sendMessage).not.toHaveBeenCalled(); expect(validateCredentials).not.toHaveBeenCalled()
})
