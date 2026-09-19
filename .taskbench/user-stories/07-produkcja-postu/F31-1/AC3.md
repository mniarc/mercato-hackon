---
id: AC3
story: F31-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Negatywny wynik blokuje przedstawienie tekstu jako gotowego; pozytywny kieruje tę wersję do 7.4.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/postReview/service.ts` — Only current assessed pass-for-draft post is invited; negative QA stays blocked.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: actual post-author and post-editor worker calls produced one post, native QA saved pass_for_draft, and the positive result opened client review without a manual employee approval. Local intelligence fixture, not live-model proof.
- `.dev-docs/integrations/generated/index.json` — Live-model proof: live verdict pass_for_draft handed the version to 7.4 - live run on order demo-open-mercato-3 (CLI, agent orchestrator + OpenRouter, 2026-09-19 02:00-06:40, final pass 06:36). Journal exported from persisted task/agent runs by 'yarn mercato agency_research journal'.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | passed |
