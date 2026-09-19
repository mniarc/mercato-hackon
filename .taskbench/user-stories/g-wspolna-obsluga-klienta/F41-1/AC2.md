---
id: AC2
story: F41-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Niejasne przypisanie powoduje pytanie o doprecyzowanie, zanim zgłoszenie wywoła zmianę w danym zamówieniu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Uncertain semantic intent can request clarification.

## Missing

- Ambiguous contact/order association is rejected or unavailable, not a dedicated association clarification flow.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
