---
id: AC3
story: F39-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Zamknięcie nie tworzy kolejnego obciążenia i nie deklaruje faktury, której system faktycznie nie utworzył.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/closure.ts` — Pure gate creates no extra charge or fabricated invoice.

## Missing

- Real close operation absent; preserve these constraints when implemented.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
