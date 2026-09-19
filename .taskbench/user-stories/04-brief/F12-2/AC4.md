---
id: AC4
story: F12-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Decyzja osoby bez potwierdzonego uprawnienia nie uruchamia 4.7; spór o uprawnienie trafia do E.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Inactive/foreign contacts fail closed before acceptance.

## Missing

- Escalate actual authority dispute to assigned E.1 instead of only authorization error.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
