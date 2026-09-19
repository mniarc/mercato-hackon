import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'

export const CLIENT_TRIAGE_ENABLED_ENV = 'OM_AGENCY_TRIAGE_ENABLED'

export function isClientTriageEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return parseBooleanWithDefault(environment[CLIENT_TRIAGE_ENABLED_ENV], false)
}
