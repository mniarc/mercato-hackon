---
id: AC3
story: F26-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Liczba tematów jest parametrem wersji STD-OFERTA przypisanej do zamówienia, a nie swobodną decyzją agenta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planningExecution/run.ts` — Plan count is mandatory product_selection.result_limits.topics from pinned order; missing count blocks.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
