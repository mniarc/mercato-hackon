---
id: AC4
story: F26-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Plan jest wersjonowany; przy poprawce zachowuje nieobjęte fragmenty oraz uzasadnia konieczne zmiany zależne.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/plan.ts` — Internal QA repair passes previous plan and findings, saves new versions.

## Missing

- Client-requested scoped revision/preservation via 6.5 is not connected.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
