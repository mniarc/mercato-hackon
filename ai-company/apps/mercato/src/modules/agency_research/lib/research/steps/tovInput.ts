import { tovBrandVoiceSchema, type TovBrandVoice } from '@/modules/agency_tov/data/validators'
import { specialistTovReferenceSchema, type SpecialistTovDocument } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { tovDataSchema, type TovData } from '../../../data/schemas/tov'
import type { StrategyExecutionInput } from './context'

export type DownstreamTov = TovData | TovBrandVoice

export function specialistTovInput(document: SpecialistTovDocument): StrategyExecutionInput {
  const specialistTov = specialistTovReferenceSchema.parse(document)
  return {
    document_id: `agency_tov:${document.documentId}`,
    version: document.version,
    status: 'approved',
    specialistTov,
    versionId: document.versionId,
    data: document.body,
  }
}

export function parseDownstreamTov(input: StrategyExecutionInput): DownstreamTov {
  return input.specialistTov ? tovBrandVoiceSchema.parse(input.data) : tovDataSchema.parse(input.data)
}

export function isSpecialistTov(tov: DownstreamTov): tov is TovBrandVoice {
  return 'voicePillars' in tov
}

export function tovVoiceTraits(tov: DownstreamTov): string[] {
  return isSpecialistTov(tov)
    ? tov.voicePillars.map((pillar) => `${pillar.name}: ${pillar.description}`)
    : tov.voice_principles.map((principle) => principle.trait)
}

export function tovCopyChecks(tov: DownstreamTov): string[] {
  return isSpecialistTov(tov) ? tov.qaChecklist : tov.copy_checks
}

export function tovInstructionRules(tov: DownstreamTov): string[] {
  return isSpecialistTov(tov)
    ? [...tov.voicePillars.map((pillar) => pillar.doThis), ...tov.doList]
    : [...tov.voice_principles.map((principle) => principle.author_behavior), tov.wording.sentence_pattern]
}

export function tovForbiddenWording(tov: DownstreamTov): string[] {
  return isSpecialistTov(tov) ? [...new Set([...tov.vocabulary.avoided, ...tov.dontList])] : tov.wording.cliches
}

export function tovShortPattern(tov: DownstreamTov): string {
  return isSpecialistTov(tov) ? tov.postFormats[0]?.skeleton ?? tov.register.summary : tov.wording.sentence_pattern
}
