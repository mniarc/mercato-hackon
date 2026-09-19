# T68 - Repair omitted findings fields before client review

State: active
Depends on: existing 3.6 author and bounded 3.7 QA repair loop
Owns: `agency_research/lib/research/steps/findings.ts`, `steps/qa.ts`,
existing `__tests__/f08.test.ts`, and the additive stored issue projection in `lib/store.ts`.
Sources: F08-1 AC1-2/5; F08-2 AC2/4-5; F09-3 AC2-4; F10-1 AC1.

## Deliver

- Preserve the existing missing-row gate evidence through persisted findings into
  3.7. A mapper omission is an agent-owned repair, not a client decision.
- Reuse `missing_must_field`, author step 3.6 and the existing repair-limit/E.1
  path; do not send a brief with an unanswerable synthetic client gap.
- Keep genuine unknown client decisions and their actionable questions unchanged.

## Done when

- An omitted required derived row produces `to_fix` with exact field and 3.6
  owner even when the model QA proposes ready; a repaired version clears it.
- Focused existing findings/QA checks preserve genuine client-question handling.

## Constraints

- No new agent, QA tier, public route, business decision or fabricated answer.
- Coordinator runs focused checks; no runtime/database/model calls by the agent.
