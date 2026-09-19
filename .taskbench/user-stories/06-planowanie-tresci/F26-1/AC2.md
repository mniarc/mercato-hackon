---
id: AC2
story: F26-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Zadania mają role i zależności z STD-PROCES oraz limity z STD-LIMITY widoczne w OM-02.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningExecution/run.ts` — Activation records process pins, roles/runners, dependency versions and caps.

## Missing

- Repair limits still use static module STD-LIMITY constants rather than order-version lookup.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
