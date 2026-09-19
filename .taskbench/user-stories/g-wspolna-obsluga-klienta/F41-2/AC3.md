---
id: AC3
story: F41-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Odpowiedź dotycząca starej wersji nie nadaje akceptacji wersji aktualnej ani przyszłej.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Stale pair/currentness conflicts cannot approve another version; portal reloads on409.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
