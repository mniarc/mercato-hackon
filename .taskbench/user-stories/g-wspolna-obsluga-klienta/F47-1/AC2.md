---
id: AC2
story: F47-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Dyspozycja rozróżnia błąd agencji od nowej potrzeby i zapisuje podstawę kwalifikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Postdelivery error-versus-new-need disposition is absent.

## Missing

- No persisted postdelivery qualification.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
