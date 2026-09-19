---
id: AC4
story: F21-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Kolejna poprawka w zakupionym zakresie jest przyjmowana bez licznika rund, dopłaty i checkoutu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Only brief_revision is an authorized change target.

## Missing

- Implement in-package client strategy revisions without a round counter or new checkout.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
