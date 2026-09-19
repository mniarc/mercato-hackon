---
id: AC3
story: F20-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Po pozytywnej kontroli etap strategii jest zamknięty, a gotowość trafia do 6.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/workflow.ts` — Accepted pair passes planning readiness into actual native 6.1 activity; blocked handoff stays held.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Complete paired approval continued into native planning readiness. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
