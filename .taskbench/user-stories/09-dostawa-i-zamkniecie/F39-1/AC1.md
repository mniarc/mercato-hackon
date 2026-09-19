---
id: AC1
story: F39-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Zamknięcie wymaga pozytywnej kontroli 9.1, skutecznego udostępnienia 9.2, dowodu publikacji i braku otwartych blokad wykonania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/closure.ts` — Deterministic gate checks payment/completeness/publication/delivery/blockers.

## Missing

- No actual case-close mutation executes this gate.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
