---
id: AC2
story: F32-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Rekord wskazuje osobę, czas i pochodzenie decyzji oraz pozostaje rozróżniony od akceptacji treści.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No separate durable consent record exists.

## Missing

- Persist authorized actor/time/source separately from post-content approval.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
