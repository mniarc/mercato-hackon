---
id: AC5
story: F58-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Zamknięcie następuje wyłącznie przy rzeczywistym spełnieniu warunków dostawy i nie pobiera ponownie płatności.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/package.ts` — Package assembly is not case closure or delivery.

## Missing

- No connected closure conditioned on proven delivery/publication with existing payment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
