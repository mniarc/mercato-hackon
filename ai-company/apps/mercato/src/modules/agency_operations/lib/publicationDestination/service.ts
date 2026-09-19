import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { CommunicationChannel } from '@open-mercato/core/modules/communication_channels/data/entities'
import { assertCanAccessChannel, channelOrgScopeWhere, ChannelAccessDeniedError } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import type { ChannelAdapterRegistry } from '@open-mercato/core/modules/communication_channels/lib/registry'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { discordCredentialsSchema } from '@open-mercato/channel-discord/modules/channel_discord/lib/credentials'
import { AGENCY_RESEARCH_SERVICE, type AgencyResearchService, type PublicationDestinationResult } from '@/modules/agency_research/lib/contracts'
import { AgencyCase } from '../../data/entities'
import { configureDiscordDestinationRequestSchema, type PublicationDestinationService } from './contracts'

const contextSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), userId: z.uuid() })
const snowflake = z.string().regex(/^\d{17,20}$/)

/** Configure only through an existing, caller-owned native connection. Never send. */
export function createPublicationDestinationService(container: AppContainer): PublicationDestinationService {
  return { async configure(rawContext, rawRequest) {
    const context = contextSchema.parse(rawContext)
    const request = configureDiscordDestinationRequestSchema.parse(rawRequest)
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
    if (!await container.resolve<Pick<RbacService, 'userHasAllFeatures'>>('rbacService').userHasAllFeatures(context.userId,
      ['agency_research.manage', 'channel_discord.view'], scope)) throw new CrudHttpError(403, { error: 'api.errors.forbidden' })
    const em = container.resolve<EntityManager>('em')
    const agencyCase = await findOneWithDecryption(em, AgencyCase, { ...scope, id: request.caseId, deletedAt: null }, undefined, scope)
    if (!agencyCase) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    const channel = await findOneWithDecryption(em, CommunicationChannel, {
      tenantId: scope.tenantId, ...channelOrgScopeWhere(scope.organizationId), id: request.nativeChannelId,
      providerKey: 'discord', channelType: 'discord', deletedAt: null,
    }, undefined, scope)
    try { assertCanAccessChannel(channel, context.userId, []) } catch (error) {
      if (error instanceof ChannelAccessDeniedError) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
      throw error
    }
    if (!channel) throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    const notReady = (reason: Extract<PublicationDestinationResult, { status: 'not_ready' }>['reason']): PublicationDestinationResult => ({
      status: 'not_ready', orderRef: request.caseId, reason, canSend: false,
    })
    if (!channel.isActive || channel.status !== 'connected') return notReady('channel_inactive')
    const adapter = container.resolve<ChannelAdapterRegistry>('channelAdapterRegistry').get('discord')
    if (!adapter || !adapter.capabilities.supportedBodyFormats.includes('text')) return notReady('adapter_unavailable')
    if (!channel.credentialsRef) return notReady('credentials_missing')
    const credentials = await container.resolve<CredentialsService>('integrationCredentialsService').resolve('channel_discord', {
      tenantId: channel.tenantId, organizationId: channel.organizationId ?? channel.tenantId, userId: channel.userId ?? null,
    })
    if (!credentials) return notReady('credentials_missing')
    const parsed = discordCredentialsSchema.safeParse(credentials)
    if (!parsed.success) return notReady('credentials_invalid')
    // Preparation deliberately supports the operator's configured default only;
    // neither the profile label nor a client URL can select a different channel.
    if (parsed.data.defaultChannelId !== request.discordChannelId) return notReady('target_not_configured')
    const guild = parsed.data.guildId ? snowflake.safeParse(parsed.data.guildId) : null
    if (guild && !guild.success) return notReady('credentials_invalid')
    const research = container.resolve<AgencyResearchService>(AGENCY_RESEARCH_SERVICE)
    const configured = await research.configurePublicationDestination({ context,
      request: { orderRef: request.caseId, nativeChannelId: channel.id, credentialsRef: channel.credentialsRef,
        accountId: guild?.success ? guild.data : null, channelId: request.discordChannelId, displayName: request.displayName },
    })
    if (configured.status !== 'configured') return configured
    const current = (await research.status(scope, request.caseId)).documents.find((document) => document.templateId === 'WZR-POST')
    if (!current?.versionId) return configured
    const accepted = await research.getPostAcceptance(scope, { orderRef: request.caseId, postVersionId: current.versionId })
    if (accepted.status !== 'ready' || accepted.orderRef !== request.caseId || accepted.post.versionId !== current.versionId
      || accepted.post.documentStatus !== 'approved' || accepted.post.versionStatus !== 'approved'
      || !accepted.receipt || accepted.receipt.documentVersionId !== current.versionId) return configured
    // Reuse the stored content decision, not a new approval or consent. The
    // producer rechecks currentness under its own lock before writing anything.
    const preparation = await research.preparePublication({ context,
      request: { orderRef: request.caseId, postVersionId: current.versionId,
        acceptanceSubmissionId: accepted.receipt.source.submissionId },
    })
    return { ...configured, preparation }
  } }
}
