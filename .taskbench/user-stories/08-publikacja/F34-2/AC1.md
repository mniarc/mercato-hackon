---
id: AC1
story: F34-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

WEW-KONFIG-PUBLIKACJI zawiera platformę, ID konta lub kanału, nazwę dla klienta i referencję integracji bez tokenów, haseł ani innych sekretów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — Versioned config schema has platform/destination/connectionRef without secrets.

## Missing

- Actual supported setup UI/service for authoritative destination IDs is missing.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
