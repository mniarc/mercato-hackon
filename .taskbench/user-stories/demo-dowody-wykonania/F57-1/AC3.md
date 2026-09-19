---
id: AC3
story: F57-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Jeśli istnieją wcześniejsze materiały, ich dotknięte zależności są oznaczone do przeglądu; przy ich braku tworzone są zadania kolejnych etapów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — Brief revision creates updated findings/brief and invokes QA.

## Missing

- No cross-document affected-version invalidation; both complete audience paths unproved.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
