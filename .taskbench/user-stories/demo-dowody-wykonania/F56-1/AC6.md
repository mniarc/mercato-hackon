---
id: AC6
story: F56-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC6

## Criterion

Przed pokazem skonfigurowane są testowa płatność i docelowy Discord. Otwarcie karty zamówienia i pokazanie wcześniejszych wyników zajmują okno 0:00–0:35 scenariusza demo.

## Evidence

- `.tasks/tasks-done/T25-paid-order-process-bootstrap.md` — Test payment is configured and exercised.

## Missing

- Target Discord and measured opening window are not configured/proved.

## Decision Required

- T31: confirm publication policy, actual provider/target and exact-version destination-bound client consent; no external send authority assumed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
