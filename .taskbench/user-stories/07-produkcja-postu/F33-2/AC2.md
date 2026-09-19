---
id: AC2
story: F33-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Brak dokładnego celu lub zgody jest jawnie oznaczony; nie uniemożliwia przekazania do przygotowania w 8.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Missing target/consent remains explicit but internal 7.7 preparation still saves.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: publication preparation was saved for the exact accepted post despite missing publication consent and retained canSend:false. No send, actual publication, Discord, or consent was exercised or inferred.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
