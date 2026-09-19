---
id: AC4
story: F22-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

W poprawce agent używa poprzedniej wersji i zachowuje nieobjęte fragmenty, a zależne zmiany uzasadnia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/tov.ts` — Previous ToV and repair findings support internal author repair.

## Missing

- No client-language revision directive is connected to targeted 5.3 execution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
