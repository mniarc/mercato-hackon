---
id: AC1
story: F30-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Po gotowości 6.8 aktywowane są zadania copywritingu, QA i akceptacji zgodne ze STD-PROCES.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/workflow.ts` — Exact ready instruction enters native author/editor flow and exact post review invitation.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: actual post-author and post-editor worker calls produced one post, native QA saved pass_for_draft, and the positive result opened client review without a manual employee approval. Local intelligence fixture, not live-model proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
