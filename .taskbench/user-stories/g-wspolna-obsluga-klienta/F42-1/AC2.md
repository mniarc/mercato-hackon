---
id: AC2
story: F42-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Mieszana wiadomość zachowuje wspólny oryginał, ale ma rozpoznane części wymagające różnych działań.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — All interpreted parts retain one submission; mixed dispositions are explicitly unapplied rather than collapsed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
