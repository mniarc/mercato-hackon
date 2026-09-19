---
id: AC4
story: F08-3
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Po uzupełnieniu z 4.5 odświeżony zestaw wraca do istniejącego 4.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/freeze.ts` — Freeze primitive can refresh changed analysis; T27 uses it for client-answer findings.

## Missing

- Targeted 4.5 evidence-return contract and resume of same brief remain missing (T26).

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
