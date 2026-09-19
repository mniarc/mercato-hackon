---
id: AC4
story: F28-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Prośba o dodatkowy post nie tworzy dodatkowego rezultatu w kupionym pakiecie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — No automatic extra-post production target exists.

## Missing

- Explicit scoped refusal/alternative handling is not implemented; unsupported route alone is not the product response.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
