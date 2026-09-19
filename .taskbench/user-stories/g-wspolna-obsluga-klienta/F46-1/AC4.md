---
id: AC4
story: F46-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Dalsze uruchomienie wymaga aktualnych wersji, zgód i braku blokad w odpowiednim kroku.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — No-send preparation checks exact content acceptance and reports missing destination consent.

## Missing

- No actual sender enforces current consent/version/hold immediately before sending.

## Decision Required

- T31: confirm publication policy, actual provider/target and exact-version destination-bound client consent; no external send authority assumed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
