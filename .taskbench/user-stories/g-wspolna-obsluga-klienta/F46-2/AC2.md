---
id: AC2
story: F46-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Brak dowodu wysłania lub niewysłania jest statusem nieznanym; nie zostaje uznany za sukces ani za bezpieczną podstawę ponowienia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Document contracts distinguish unknown from confirmation and prohibit blind retry in their stated contract.

## Missing

- No real provider attempt or reconciliation implements those states.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
