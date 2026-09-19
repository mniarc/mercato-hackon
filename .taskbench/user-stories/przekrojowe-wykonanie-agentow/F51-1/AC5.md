---
id: AC5
story: F51-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Wynik nieznany zewnętrznej wysyłki wymaga ustalenia stanu; sam niewyczerpany limit nie uprawnia do ślepego ponowienia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No-send preflight and unknown-outcome contract avoid pretending success.

## Missing

- Actual external-send reconciliation is missing.

## Decision Required

- T31: confirm publication policy, actual provider/target and exact-version destination-bound client consent; no external send authority assumed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
