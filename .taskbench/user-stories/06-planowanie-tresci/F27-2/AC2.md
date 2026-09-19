---
id: AC2
story: F27-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Może zaakceptować plan, wybrać lub zmienić jeden temat, zgłosić uwagi, zapytać albo wstrzymać pracę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/planReview/service.ts` — Explicit approval/topic and comments are accepted.

## Missing

- Comments/hold and changed topic after existing production lack the complete coordination/invalidation loop.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
