---
id: AC1
story: F10-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przekazanie wskazuje dokładną wersję KLI-BRIEF i pytania wynikające z kontroli 4.2.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefStrategyProcess/service.ts` — Native brief review stores exact immutable snapshot and current QA-backed response permissions.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. Portal showed the exact initial brief and its eight actual QA questions. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: research-brief-to-client-review handoff observed live: exact KLI-BRIEF version + 4.2 questions to the brief-review user task - live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | passed |
