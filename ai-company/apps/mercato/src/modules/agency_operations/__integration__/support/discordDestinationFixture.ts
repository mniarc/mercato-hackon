import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { APIRequestContext } from '@playwright/test'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { apiRequest } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import type { DiscordDestinationFixture } from './discordDestinationFixture.backend'

export type { DiscordDestinationFixture } from './discordDestinationFixture.backend'
type Backend = typeof import('./discordDestinationFixture.backend')
type Caller = { request: APIRequestContext; token: string }
let loaded: Promise<Backend> | undefined

function backend() {
  return loaded ??= (async () => {
    const appRoot = path.resolve(process.env.OM_TEST_APP_ROOT ?? path.resolve(process.cwd(), 'apps/mercato'))
    const output = await compileAppSourceFile(path.join(appRoot, 'src/modules/agency_operations/__integration__/support/discordDestinationFixture.backend.ts'), {
      appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/discord-destination-fixture.mjs'), format: 'esm',
    })
    return import(pathToFileURL(output).href) as Promise<Backend>
  })()
}

function assertCaller(input: Pick<DiscordDestinationFixture, 'tenantId' | 'organizationId' | 'userId'>, token: string) {
  const actor = getTokenScope(token)
  if (actor.userId !== input.userId || actor.tenantId !== input.tenantId || actor.organizationId !== input.organizationId) {
    throw new Error('Discord fixture must be owned by its authenticated staff caller')
  }
}

export async function configureDiscordDestinationFixture(input: Caller & {
  tenantId: string; organizationId: string; userId: string;
}): Promise<DiscordDestinationFixture> {
  assertCaller(input, input.token)
  const fixture = await (await backend()).prepareDiscordDestinationCredentials({
    tenantId: input.tenantId, organizationId: input.organizationId, userId: input.userId,
  })
  try {
    const response = await apiRequest(input.request, 'POST', '/api/communication_channels/test-seed', {
      token: input.token, retryTransport: false,
      data: { action: 'connect-channel', providerFlavor: 'chat', labelAsProviderKey: 'discord',
        displayName: fixture.displayName, externalIdentifier: fixture.fixtureId },
    })
    const saved = await readJsonSafe<{ channelId?: string }>(response)
    if (response.status() !== 201 || !saved?.channelId) {
      throw new Error(`Native Discord fixture channel setup failed (${response.status()}); check native test-channel seeding configuration`)
    }
    fixture.nativeChannelId = saved.channelId
    return fixture
  } catch (error) {
    await cleanupDiscordDestinationFixture(fixture, input)
    throw error
  }
}

export async function cleanupDiscordDestinationFixture(fixture: DiscordDestinationFixture, caller: Caller): Promise<void> {
  assertCaller(fixture, caller.token)
  const helper = await backend()
  const channelId = await helper.findOwnedDiscordFixtureChannel(fixture)
  if (channelId) {
    const response = await apiRequest(caller.request, 'DELETE', `/api/communication_channels/channels/${channelId}`, {
      token: caller.token, retryTransport: false,
    })
    if (response.status() !== 204 && response.status() !== 404) {
      throw new Error(`Native Discord fixture channel cleanup failed (${response.status()})`)
    }
  }
  await helper.clearOwnedDiscordFixtureCredentials(fixture)
}
