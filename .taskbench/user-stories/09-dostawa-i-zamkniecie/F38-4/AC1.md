---
id: AC1
story: F38-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Błąd przekazania lub zapewnienia dostępu zapisuje blokadę dostawy powiązaną z klientem, zamówieniem i wersjami materiałów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — No delivery attempt is executed.

## Missing

- Persist scoped real delivery failure and held state.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
