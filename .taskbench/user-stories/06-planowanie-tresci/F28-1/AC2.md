---
id: AC2
story: F28-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Koordynator używa wyniku zakresu i wpływu z G, zapisując powód powrotu i wpływ na istniejące zlecenie postu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Saved G rationale and exact plan selection are visible.

## Missing

- Impact propagation to an already-created post instruction is not an applied G capability.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
