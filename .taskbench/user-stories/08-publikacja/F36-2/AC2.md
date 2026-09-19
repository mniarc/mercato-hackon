---
id: AC2
story: F36-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Równoległe dopuszczenia dla tej samej realizacji nie uzyskują dwóch ważnych rezerwacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No transactional reservation mutation exists.

## Missing

- Prevent concurrent valid reservations at the storage boundary.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
