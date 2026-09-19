---
id: AC5
story: F37-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Rozstrzygnięcie pracownika nie omija aktualnych bramek i nie zmienia limitów poprawek klienta w opłaty rundowe.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/handoff.ts` — Employee exception evidence explicitly says continuation unsupported.

## Missing

- Implement producer-owned guarded continuation; staff decision must not bypass publication gates.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
