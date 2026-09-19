---
id: AC5
story: F12-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Klient nie podpisuje osobno pustego wzorca ani wewnętrznego rejestru; akceptacja dotyczy briefu i pozwala przejść do 4.7.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Approval concerns actual brief; separate strategy readiness follows without signing empty templates.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Client accepted the displayed brief only; strategy continued without another blank-template consent. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
