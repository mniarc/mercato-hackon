---
id: AC5
story: F42-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Lokalny dział otrzymuje wynik triażu i nie klasyfikuje ponownie tego samego zgłoszenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Implemented coordinators consume saved interpretation and original source IDs.

## Missing

- General scope/impact destinations remain unsupported, so cross-domain no-retriage behavior is incomplete.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
