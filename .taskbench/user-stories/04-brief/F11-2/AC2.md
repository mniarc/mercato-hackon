---
id: AC2
story: F11-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

3.8 zapisuje aktualny zestaw wersji analizy i wynik uzupełnienia 4.5 z dyspozycją powrotu do tej samej realizacji 4.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — After ready QA, 3.8 freezes the refreshed exact version set and invokes the existing brief producer for the same order.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
