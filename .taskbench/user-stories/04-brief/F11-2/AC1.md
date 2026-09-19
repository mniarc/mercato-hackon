---
id: AC1
story: F11-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Uzupełnione elementy przechodzą QA w 3.7 przed odświeżeniem przekazywanego pakietu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — Changed material findings pass through the existing analysis QA before freeze or brief refresh.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/__tests__/run.test.ts` — Focused negative-QA coverage proves freeze and brief producers are not invoked when analysis QA blocks.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
