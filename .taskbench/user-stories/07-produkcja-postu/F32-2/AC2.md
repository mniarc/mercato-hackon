---
id: AC2
story: F32-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Odpowiedź „akceptuję, ale zmień…” pozostaje dyspozycją zmiany i nie otwiera bramki akceptacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Mixed change/approval recommendation cannot open approval target; task approval rejects conflicting comment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
