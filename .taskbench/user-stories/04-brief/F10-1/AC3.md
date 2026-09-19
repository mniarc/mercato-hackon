---
id: AC3
story: F10-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Klient może uzupełnić dane, dodać materiał, zgłosić poprawkę, zaakceptować wersję, zapytać lub wstrzymać pracę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefStrategyProcess/service.ts` — Portal supports comments, exact approval and ordinary requests; material intake is real.

## Missing

- Complete integrated evidence-upload/update and pause outcomes at brief rather than receipt-only or unsupported disposition.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
