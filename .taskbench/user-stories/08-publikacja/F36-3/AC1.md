---
id: AC1
story: F36-3
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Bezpośrednio przed rozpoczęciem adapter atomowo sprawdza rezerwację, wersję, zgodę i brak blokady oraz przełącza próbę w stan wysyłania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Publication lane explicitly never calls an adapter.

## Missing

- Implement atomic send-start guard against live reservation/version/consent/hold.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
