---
id: AC2
story: F30-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Post zachowuje temat, odbiorcę, język i dowody z instrukcji oraz wskazuje wersje dokumentów, na których powstał.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/post.ts` — Frozen instruction inputs constrain topic, audience, language and claims; exact versions persisted.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live post keeps topic, audience, language and evidence ids of the instruction; pins document versions - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | passed |
