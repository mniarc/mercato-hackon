---
id: AC2
story: F40-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Pytanie przechodzi jeden triaż i otrzymuje dyspozycję do sprzedaży w 1.2.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Native routing targets existing case processing, not sales step1.2.

## Missing

- No prepurchase question-to-sales disposition.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
