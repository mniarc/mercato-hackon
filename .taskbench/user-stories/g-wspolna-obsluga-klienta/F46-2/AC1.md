---
id: AC1
story: F46-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Gdy wysyłka już się rozpoczęła, system nie obiecuje jej zatrzymania i kieruje sprawę do ustalenia wyniku w 8.6.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Unknown-send semantics are documented in the teammate seam, not executed.

## Missing

- No send-in-progress reconciliation route8.6.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
