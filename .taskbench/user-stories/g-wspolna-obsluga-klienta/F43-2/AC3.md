---
id: AC3
story: F43-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Przy braku danych system zadaje konkretne pytanie i czeka na doprecyzowanie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Generic intent clarification is implemented.

## Missing

- Missing purchased-scope facts are not yet assessed by a scope-specific question flow.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
