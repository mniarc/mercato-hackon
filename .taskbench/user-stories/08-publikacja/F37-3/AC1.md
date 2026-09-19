---
id: AC1
story: F37-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

WEW-POTWIERDZENIE-PUBLIKACJI powstaje wyłącznie na podstawie potwierdzonego wyniku 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfirmation.ts` — Typed confirmation document exists but only records not_executed.

## Missing

- Create confirmed publication receipt only from actual 8.6 provider proof.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
