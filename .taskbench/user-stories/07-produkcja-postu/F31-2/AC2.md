---
id: AC2
story: F31-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Wynik researchu wraca do tego zadania QA; uzupełnienie dowodu bez zmiany treści ani bazowych założeń nie tworzy nowego briefu i nie wymaga ponownych akceptacji niezmienionych dokumentów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/run.ts` — Post producer forbids fresh research and replays its existing activation.

## Missing

- Connect evidence-only supplement back to original QA without regenerating unchanged brief/approvals.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
