---
id: AC4
story: F30-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Każda poprawka tworzy nową wersję połączoną z dyspozycją; zachowuje treści nieobjęte zmianą albo wskazuje konieczną zmianę zależną.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/post.ts` — Internal QA repair saves new versions using previous text/findings.

## Missing

- Client G correction directive and preservation of unaffected content are not connected to scoped author execution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
