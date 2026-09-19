---
id: AC5
story: F37-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Upływ czasu ani sama decyzja pracownika o retry nie są dowodem niewysłania i nie zdejmują blokady.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Pure gates do not treat elapsed time as proof.

## Missing

- Enforce rule in actual reconciliation/staff retry service.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
