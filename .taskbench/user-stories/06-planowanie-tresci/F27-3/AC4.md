---
id: AC4
story: F27-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

System nie wybiera losowo ani nie przyjmuje automatycznie rekomendacji za wybór klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postInstructionExecution/run.ts` — Only typed selectedTopicId from receipt is used; no random or automatic recommended topic.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
