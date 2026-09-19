---
id: AC3
story: F37-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Odnaleziona rzeczywista wiadomość prowadzi do potwierdzenia sukcesu; pewny dowód niepowodzenia może dopuścić kontrolowany powrót do 8.4.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No actual reconciliation transitions exist.

## Missing

- Confirm discovered message or prove non-send before retry eligibility.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
