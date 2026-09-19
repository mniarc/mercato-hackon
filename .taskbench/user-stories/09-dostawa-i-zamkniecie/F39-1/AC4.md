---
id: AC4
story: F39-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Klient otrzymuje informację o wykonaniu bez obowiązku nowego zakupu lub formalnej akceptacji zamknięcia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — No final delivery notification is sent.

## Missing

- Notify existing client after verified completion without new purchase/approval.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
