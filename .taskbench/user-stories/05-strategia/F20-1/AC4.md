---
id: AC4
story: F20-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Limity są odczytywane ze STD-LIMITY; aktywacja nie tworzy nowego procesu ani prośby o dodatkową zgodę klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Repair counts come from shared limits; configured native spend cap is pinned.

## Missing

- Runtime limits still use module constants rather than resolving an order-pinned version of STD-LIMITY.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
