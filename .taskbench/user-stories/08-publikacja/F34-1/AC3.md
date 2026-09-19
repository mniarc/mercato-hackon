---
id: AC3
story: F34-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Ponowne otrzymanie tego samego przekazania 7.7 odnosi się do istniejącej realizacji publikacji i nie tworzy drugiej.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Internal preparation is replay-safe for exact accepted post/source.

## Missing

- Publication execution identity and deduplication are not implemented.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
