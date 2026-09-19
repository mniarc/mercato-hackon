---
id: AC2
story: F26-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Każdy temat ma ID, filar strategii, cel, ujęcie, argument ze źródłem, zamierzone CTA, kanał i proponowany dzień.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/plan.ts` — Versioned topic structure includes stable IDs, pillar, angle/message/evidence/CTA/channel/day.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live topics carry id, pillar, goal, angle, argument with source, CTA, channel and day - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
