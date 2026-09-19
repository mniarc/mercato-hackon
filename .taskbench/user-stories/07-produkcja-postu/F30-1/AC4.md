---
id: AC4
story: F30-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Wykonanie stosuje limity techniczne ze STD-LIMITY, które nie są limitem rund poprawek klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/run.ts` — Producer uses explicit spend cap and static technical repair limits, not client round charges.

## Missing

- Read limits from assigned STD-LIMITY version rather than module constants.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
