---
id: AC1
story: F10-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Zwykły brief zapisuje grupę odbiorców wskazaną przez klienta. W demonstracji Open Mercato działają wariant A: developerzy i wariant B: właściciele agencji; nie są to dwa jedyne segmenty dozwolone w produkcie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/applyAnswers.ts` — Native answer application stores literal substantive audience answer, not fixed segment enum.
- `ai-company/apps/mercato/src/modules/agency_research/lib/agents/brief.ts` — Audience writer consumes client-selected field_map value; trusted answer application accepts literal audience text without a fixed-segment enum, so developer and agency-owner choices use the same implemented path. Neither named demo variant has a connected runtime pass.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
