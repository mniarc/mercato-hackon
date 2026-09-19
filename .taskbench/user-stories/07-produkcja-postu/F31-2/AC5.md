---
id: AC5
story: F31-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Do rozstrzygnięcia brakującego dowodu wersja nie uzyskuje pozytywnego QA; wyczerpanie możliwości prowadzi do E z kompletem kontekstu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postQa.ts` — Missing/unsupported facts block pass; exhausted repair escalates.

## Missing

- A genuine bounded research supplement must be attempted/recorded before its own exhaustion can be resolved.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
