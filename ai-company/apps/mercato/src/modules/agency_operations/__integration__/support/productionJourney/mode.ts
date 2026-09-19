import fs from 'node:fs'
import path from 'node:path'
import { startNativeTriageProvider } from '../nativeTriageProvider'
import { createProductionJourneyIntelligence } from './intelligence'

export type JourneyMode = 'fixture' | 'live'
export type JourneyIntelligence = Omit<ReturnType<typeof createProductionJourneyIntelligence>, 'resolveStructured'> & { mode: JourneyMode }
export function readJourneyMode(env: NodeJS.ProcessEnv = process.env): JourneyMode {
  const mode = env.AGENCY_JOURNEY_INTELLIGENCE ?? 'fixture'
  if (mode !== 'fixture' && mode !== 'live') throw new Error('Select fixture or live journey intelligence')
  if (env.NODE_ENV === 'production') throw new Error('Run this journey only against a dedicated non-production runtime')
  if (mode === 'fixture') {
    if (env.AGENCY_TEST_NATIVE_TRIAGE !== '1' || env.OPENROUTER_BASE_URL !== 'http://127.0.0.1:5003/v1'
      || env.OPENROUTER_API_KEY !== 'agency-triage-fixture-only'
      || !['agency-triage-fixture', 'openrouter/agency-triage-fixture'].includes(env.OM_AI_MODEL ?? '')) {
      throw new Error('Fixture intelligence requires the exact unpaid loopback tuple')
    }
  } else {
    if (env.AGENCY_ALLOW_LIVE !== '1' || !env.AGENCY_JOURNEY_POLICY_FILE || !env.AGENCY_JOURNEY_CLIENT_INPUT_FILE) {
      throw new Error('Live journey requires explicit paid opt-in, approved policy and original client input files')
    }
    if (env.AGENCY_TEST_NATIVE_TRIAGE === '1' || env.AGENCY_TEST_NATIVE_POST === '1'
      || !env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY === 'agency-triage-fixture-only'
      || env.OM_AI_PROVIDER !== 'openrouter' || !env.OM_AI_MODEL?.startsWith('openrouter/')
      || env.OM_AI_MODEL.includes('fixture') || env.OPENROUTER_BASE_URL) {
      throw new Error('Live journey requires central OpenRouter configuration without fixture flags or endpoint overrides')
    }
  }
  return mode
}

export type ClientJourneyInput = { answers: Record<string, string>; selectedTopicId: string }
export function readClientJourneyInput(mode: JourneyMode): ClientJourneyInput | null {
  if (mode === 'fixture') return null
  const input: unknown = JSON.parse(fs.readFileSync(path.resolve(process.env.AGENCY_JOURNEY_CLIENT_INPUT_FILE!), 'utf8'))
  if (!input || typeof input !== 'object' || !('answers' in input) || !('selectedTopicId' in input)
    || !input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)
    || Object.values(input.answers).some((answer) => typeof answer !== 'string' || !answer.trim())
    || typeof input.selectedTopicId !== 'string' || !input.selectedTopicId.trim()) {
    throw new Error('Client input must contain explicit answers keyed by brief field and a selectedTopicId')
  }
  return input as ClientJourneyInput
}

export async function startJourneyIntelligence(appRoot: string, mode: JourneyMode) {
  if (mode === 'fixture') {
    const intelligence = { ...createProductionJourneyIntelligence(appRoot), mode: 'fixture' as const }
    const provider = await startNativeTriageProvider(5003, { resolveStructured: intelligence.resolveStructured })
    return { mode, intelligence, baseUrl: provider.baseUrl, close: () => provider.close() }
  }
  const ignore = () => undefined
  const intelligence: JourneyIntelligence = {
    mode: 'live', calls: [], allowMaterial: ignore, allowAnswers: ignore, allowBriefApproval: ignore,
    allowPairApproval: ignore, allowPairCorrection: ignore, allowPlanApproval: ignore, allowPostProduction: ignore, allowPostApproval: ignore,
  }
  return { mode, intelligence, baseUrl: null, close: async () => undefined }
}
