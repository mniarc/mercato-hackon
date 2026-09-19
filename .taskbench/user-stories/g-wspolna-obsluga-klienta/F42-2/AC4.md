---
id: AC4
story: F42-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Poprawiona wersja trafia do odpowiedniej akceptacji klienta; wcześniejsza wypowiedź nie jest zgodą na niewidoczny jeszcze rezultat.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — Brief answers regenerate a new version with QA and fresh invitation; exact approvals never cover unseen versions.

## Missing

- General strategy/plan/post change routing and reinvitation are not connected.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
