---
id: AC4
story: F60-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Brak konfiguracji lub niespójne odwołanie blokują dane wykonanie z konkretną przyczyną; agent nie wymyśla brakującego wzorca, zakresu lub punktu powrotu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyExecution/reviewHandoff.ts` — Missing/inconsistent process authorization and inputs produce explicit blocked reason, not invented defaults.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
