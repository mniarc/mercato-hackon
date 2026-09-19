---
id: AC3
story: F32-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Decyzja dotycząca nieaktualnego tekstu nie zatwierdza nowszej wersji; wcześniejsza zgoda pozostaje w historii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postAcceptance/accept.ts` — Exact-version/currentness gate and source-bound replay preserve historical receipt without approving another version.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
