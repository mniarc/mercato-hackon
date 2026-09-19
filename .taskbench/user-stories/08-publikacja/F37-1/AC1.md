---
id: AC1
story: F37-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Potwierdzenie utworzenia wiadomości wymaga dowodu dostawcy oraz ID wiadomości i danych pozwalających uzyskać rzeczywisty link.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Current confirmation deliberately has null external ID/link/time.

## Missing

- Ingest provider evidence and exact message identity.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
