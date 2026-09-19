---
id: AC3
story: F42-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Publikacja poprawianego postu pozostaje zablokowana do zakończenia wymaganej obsługi uwagi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Publication preparation is no-send and does not infer publication consent from content acceptance.

## Missing

- No pending-send hold exists to bind a mixed comment to publication blocking.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
