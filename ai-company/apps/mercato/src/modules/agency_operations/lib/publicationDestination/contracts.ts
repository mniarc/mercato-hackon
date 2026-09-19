import { z } from 'zod'
import type { PublicationDestinationResult, ResearchExecutionContext } from '@/modules/agency_research/lib/contracts'

export const AGENCY_PUBLICATION_DESTINATION_SERVICE = 'agencyPublicationDestinationService'
export const configureDiscordDestinationRequestSchema = z.object({
  caseId: z.uuid(), nativeChannelId: z.uuid(), discordChannelId: z.string().regex(/^\d{17,20}$/),
  displayName: z.string().trim().min(1).max(200),
}).strict()
export type ConfigureDiscordDestinationRequest = z.infer<typeof configureDiscordDestinationRequestSchema>
export type PublicationDestinationService = {
  configure(context: ResearchExecutionContext, request: ConfigureDiscordDestinationRequest): Promise<PublicationDestinationResult>
}
