---
id: AC3
story: F11-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Powrót nie tworzy drugiego briefu ani drugiej sprawy realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/claim.ts` — The current WZR-BRIEF parent is claimed in place and its prior version remains preserved; the revision never creates another case.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — The refreshed brief is another version on the same order/document flow.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
