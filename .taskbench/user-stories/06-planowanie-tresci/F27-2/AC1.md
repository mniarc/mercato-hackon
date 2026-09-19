---
id: AC1
story: F27-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Klient otrzymuje plan po QA z identyfikatorem wersji i wyraźnie oznaczonym rekomendowanym tematem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/planReview/service.ts` — Invitation renders exact current QA-ready plan with version and recommended topic.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the QA-gated WZR-PLAN reached the native client review with actual offered topics; in one authenticated interaction the client approved that exact plan and selected the actually offered TOP02, which passed current-plan/QA validation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
