---
id: AC1
story: F38-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

KLI-PAKIET powstaje według WZR-PAKIET i zawiera wnioski audytu oraz konkurencji, odnośniki do istniejących zaakceptowanych wersji briefu, strategii, TOV, planu i postu oraz dowód publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/package.ts` — WZR-PAKIET links existing document versions and publication receipt, with audit takeaways.

## Missing

- Connect actual accepted completion package to client delivery; current data may remain simulated/blocked.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
