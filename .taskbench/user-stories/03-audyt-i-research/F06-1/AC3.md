---
id: AC3
story: F06-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Orkiestrator nie dodaje samodzielnie nowego zakresu audytu lub alternatywnego procesu firmy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/activity.ts` — Uploaded product selection must exactly match immutable configured policy; through/cost limits are staff-owned.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
