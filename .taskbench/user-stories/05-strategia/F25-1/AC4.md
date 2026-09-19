---
id: AC4
story: F25-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Zmiana kierunku mieszcząca się w tym samym pakiecie jest realizowana bez dopłaty za rundę; zwiększenie zakresu nie jest wykonywane na podstawie samej dyspozycji zmiany założeń.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — No executable in-scope strategy direction-change route.

## Missing

- Implement authorized in-package direction changes and explicit refusal of extra outputs.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
