---
id: AC5
story: F11-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Negatywne QA kieruje braki do poprawy lub wyjątek do E, zamiast przekazywać niesprawdzone źródła jako gotowy pakiet.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — Non-ready analysis QA returns analysis_blocked and preserves its escalation instead of freezing or handing an unchecked package to the brief.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/__tests__/run.test.ts` — Focused checks prove the negative-QA path skips freeze and brief production.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
