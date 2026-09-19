---
id: AC5
story: F34-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Trwała awaria prowadzi do E.1–E.3 z dowodami i punktem wznowienia, bez deklaracji gotowości integracji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — No actual integration check/retry occurs.

## Missing

- Persist technical access failures and exhausted-attempt E routing.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
