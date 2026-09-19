---
id: AC3
story: F01-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Prośba wykraczająca poza katalog kończy się wyjaśnieniem ograniczenia, bez dodania indywidualnego zakresu lub negocjowanej ceny.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/sales-advisor/prompt.ts` — Sales prompt explicitly forbids negotiated price or scope.

## Missing

- Apply catalogue-bound response in the real sales conversation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
