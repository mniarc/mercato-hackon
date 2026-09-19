---
id: AC2
story: F38-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

System wykonuje dozwolone techniczne ponowienia zgodnie z limitami, zapisując rzeczywisty wynik każdej próby.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — No sharing retry implementation.

## Missing

- Execute bounded authorized retries with evidence per attempt.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
