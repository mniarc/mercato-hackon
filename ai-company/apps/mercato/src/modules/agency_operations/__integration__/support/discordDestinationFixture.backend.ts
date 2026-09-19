import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import { bootstrapFromAppRoot } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { isTestChannelSeedingEnabled, TEST_SEED_CHAT_PROVIDER_KEY } from '@open-mercato/core/modules/communication_channels/lib/test-seed'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { readJourneyMode } from './productionJourney/mode'

export type DiscordDestinationFixture = {
  tenantId: string; organizationId: string; userId: string;
  fixtureId: string; nativeChannelId: string; discordChannelId: string; displayName: string;
}

const discordIntegration = 'channel_discord'
const stubIntegration = `channel_${TEST_SEED_CHAT_PROVIDER_KEY}`

async function open() {
  readJourneyMode()
  if (!isTestChannelSeedingEnabled()) {
    throw new Error('Discord destination fixture requires local native triage and OM_ENABLE_TEST_CHANNEL_SEEDING')
  }
  await bootstrapFromAppRoot(path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato')))
  return createRequestContainer()
}

function credentialScope(fixture: Pick<DiscordDestinationFixture, 'tenantId' | 'organizationId' | 'userId'>) {
  return { tenantId: fixture.tenantId, organizationId: fixture.organizationId, userId: fixture.userId }
}

export async function prepareDiscordDestinationCredentials(input: {
  tenantId: string; organizationId: string; userId: string;
}): Promise<DiscordDestinationFixture> {
  const container = await open()
  try {
    const credentials = container.resolve<CredentialsService>('integrationCredentialsService')
    const scope = credentialScope(input)
    for (const integrationId of [discordIntegration, stubIntegration]) {
      const existing = await credentials.getRaw(integrationId, scope)
      if (existing && Object.keys(existing).length) {
        throw new Error('Discord fixture will not overwrite existing connection credentials; use a fixture-owned staff account')
      }
    }
    const fixtureId = randomUUID()
    const fixture: DiscordDestinationFixture = {
      ...input, fixtureId, nativeChannelId: '', discordChannelId: '990000000000000001',
      displayName: `TC-AGENCY-002 test-only Discord ${fixtureId}`,
    }
    await credentials.save(discordIntegration, {
      botToken: `not-a-real-discord-token:${fixtureId}`,
      applicationId: '990000000000000002', publicKey: '0'.repeat(64),
      guildId: '990000000000000003', defaultChannelId: fixture.discordChannelId,
      agencyFixtureId: fixtureId,
    }, scope)
    return fixture
  } finally { await container.dispose() }
}

export async function findOwnedDiscordFixtureChannel(fixture: DiscordDestinationFixture): Promise<string | null> {
  const container = await open()
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const scope = { tenantId: fixture.tenantId, organizationId: fixture.organizationId }
    const channel = await findOneWithDecryption(em, CommunicationChannel, {
      ...scope, userId: fixture.userId, displayName: fixture.displayName,
      channelType: 'discord', deletedAt: null,
      ...(fixture.nativeChannelId ? { id: fixture.nativeChannelId } : {}),
    }, undefined, scope)
    if (!channel) return null
    if (![TEST_SEED_CHAT_PROVIDER_KEY, 'discord'].includes(channel.providerKey)) {
      throw new Error('Discord fixture channel changed provider; refusing cleanup')
    }
    return channel.id
  } finally { await container.dispose() }
}

export async function clearOwnedDiscordFixtureCredentials(fixture: DiscordDestinationFixture): Promise<void> {
  const container = await open()
  try {
    const credentials = container.resolve<CredentialsService>('integrationCredentialsService')
    const scope = credentialScope(fixture)
    const discord = await credentials.getRaw(discordIntegration, scope)
    if (discord?.agencyFixtureId === fixture.fixtureId) await credentials.save(discordIntegration, {}, scope)
    const stub = await credentials.getRaw(stubIntegration, scope)
    if (stub?.handle === fixture.fixtureId) await credentials.save(stubIntegration, {}, scope)
  } finally { await container.dispose() }
}
