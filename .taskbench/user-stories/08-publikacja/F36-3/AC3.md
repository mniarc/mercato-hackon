---
id: AC3
story: F36-3
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Adapter rzeczywiście wysyła niezmienny zaakceptowany tekst do przypisanego celu przez obsługiwaną integrację.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No message is sent by this implementation.

## Missing

- Implement authorized provider send of immutable payload.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
