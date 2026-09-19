---
id: AC3
story: F60-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Przed uruchomieniem agenta system sprawdza dostępność wymaganych wzorców oraz zgodność odwołań i zależności jego konfiguracji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyExecution/run.ts` — Native phase readiness checks exact accepted foundations and required existing input documents.

## Missing

- No complete WZR availability/reference check for every role configuration.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
