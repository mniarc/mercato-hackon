---
id: AC4
story: F10-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Każda odpowiedź jest zdarzeniem kierowanym do G.1; lokalny etap briefu nie wykonuje osobnej kwalifikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefStrategyProcess/service.ts` — Original brief response becomes common client submission for native G; revision extractor is not second triage.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Original answer and approval responses each passed through native G. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
