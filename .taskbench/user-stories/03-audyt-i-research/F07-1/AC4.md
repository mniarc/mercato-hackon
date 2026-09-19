---
id: AC4
story: F07-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Publiczne reakcje nie są przeliczane na konwersję lub ROI.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/agents/shared.ts` — Shared prompts and source schemas forbid reactions-as-ROI claims.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live audit output passed the no-reactions-as-ROI validator - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36); live GUI cases aaedcb14-b416-4cd6-9f06-d1dc06ab7e61 and 26fcfecf-7ef7-4887-80f9-0fabb1007755 (Flow Centrum Badawcze, agency_operations.analysis.v1, 2026-09-19 13:00-18:10). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | passed |
