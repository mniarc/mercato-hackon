---
id: AC5
story: F28-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Poprawki w zakresie nie mają limitu rund ani opłat rundowych; nowe wersje przechodzą właściwą kontrolę i akceptację.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Only brief client revision currently executes.

## Missing

- Implement unlimited in-package plan revisions with fresh QA/review and no checkout.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
