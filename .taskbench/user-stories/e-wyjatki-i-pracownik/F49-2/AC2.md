---
id: AC2
story: F49-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Brakująca decyzja biznesowa klienta pozostawia odpowiednią blokadę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Question creation and client reply leave parent exception blocked.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
