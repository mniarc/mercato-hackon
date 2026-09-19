---
id: AC4
story: F47-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Jeśli brak ustalonej i wykonalnej ścieżki naprawy, sprawa zachowuje opis przeszkody i trafia do rozstrzygnięcia E, bez oznaczania naprawy jako wykonanej.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Existing E.1 route is producer QA/budget-specific.

## Missing

- No infeasible published-message-repair exception with actual external evidence.

## Decision Required

- T31: confirm publication policy, actual provider/target and exact-version destination-bound client consent; no external send authority assumed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
