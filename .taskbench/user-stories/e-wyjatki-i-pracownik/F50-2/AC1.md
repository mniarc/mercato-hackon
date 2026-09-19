---
id: AC1
story: F50-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Jeśli brakuje aktualnej zgody, dowodu lub innego warunku kroku, system utrzymuje blokadę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyExecution/reviewHandoff.ts` — Initial/replayed unready phases remain explicitly blocked; no unsafe resume occurs.

## Missing

- Revalidation after an obstacle-resolving employee decision awaits a real resume contract.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
