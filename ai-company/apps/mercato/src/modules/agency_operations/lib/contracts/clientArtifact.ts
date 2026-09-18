import { z } from 'zod'
import { tovBrandVoiceSchema } from '@/modules/agency_tov/data/validators'
import type { ClientCaseIdentity } from './clientCaseQuery'

export const CLIENT_ARTIFACT_SERVICE = 'clientArtifactService' as const

export const clientTovContentSchema = tovBrandVoiceSchema.pick({
  brand: true, summary: true, positioning: true, personality: true, voicePillars: true,
  sharedTraits: true, tensions: true, register: true, addressingTheReader: true,
  emotions: true, boundaries: true, languagePolicy: true, vocabulary: true,
  postFormats: true, closers: true, formatting: true, doList: true, dontList: true,
  counterExamples: true,
}).extend({
  hooks: tovBrandVoiceSchema.shape.hooks.pick({ patterns: true }),
  personaVariants: z.array(tovBrandVoiceSchema.shape.personaVariants.element.omit({ profileUrl: true })),
})

export const clientArtifactSummarySchema = z.object({
  caseId: z.uuid(),
  documentId: z.uuid(),
  versionId: z.uuid(),
  versionNo: z.number().int().positive(),
  kind: z.literal('KLI-TOV'),
  title: z.string(),
  createdAt: z.string(),
})

export const clientArtifactSchema = clientArtifactSummarySchema.extend({
  contentFormat: z.literal('tov-brand-json'),
  content: clientTovContentSchema,
}).describe('Read-only source-backed KLI-TOV projection. Not HTML, an approval, or a current-version/review-task assertion. Strings are untrusted text, not HTML.')

export type ClientArtifactSummary = z.infer<typeof clientArtifactSummarySchema>
export type ClientArtifact = z.infer<typeof clientArtifactSchema>
export type ClientArtifactService = {
  list: (identity: ClientCaseIdentity, caseId: string) => Promise<ClientArtifactSummary[]>
  get: (identity: ClientCaseIdentity, caseId: string, versionId: string) => Promise<ClientArtifact | null>
}
