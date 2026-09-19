---
id: AC4
story: F59-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Opcjonalne Q&A pokazuje tylko wdrożoną gałąź, np. dodatkowy post poza zakresem, niejasną prośbę lub wyjątek z właścicielem, decyzją i powrotem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Real exception/question branch can be shown from headed proof; basic clarification exists.

## Missing

- Full exception-decision-resume and outside-scope branches are not implemented and must not be presented as ready.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
