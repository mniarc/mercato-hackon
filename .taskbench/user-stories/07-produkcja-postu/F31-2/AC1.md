---
id: AC1
story: F31-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Zlecenie do właściwego zadania procesu 3 wskazuje brakujące twierdzenie, zadanie QA, wersję postu i punkt powrotu 7.3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postQa.ts` — Editor currently produces 7.2 repair findings; no research return task.

## Missing

- Create scoped missing-claim task with QA/post version and 7.3 return binding.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
