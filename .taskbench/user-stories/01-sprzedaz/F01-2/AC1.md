---
id: AC1
story: F01-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Agent otrzymuje pytanie zakwalifikowane przez G i odpowiada na podstawie wersji katalogu produktu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/sales-advisor/definition.ts` — Registered propose-only sales advisor describes catalogue-grounded answers.

## Missing

- Wire saved G-classified sales questions to this agent and deliver its response.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
