---
id: AC3
story: F56-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Płatność testowa jest opisana jako testowa i nie jest nazywana produkcyjną transakcją.

## Evidence

- `.tasks/tasks-done/T25-paid-order-process-bootstrap.md` — Headed TC-AGENCY-003 verifies explicitly labeled zero-charge test-provider payment, not production charging.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
