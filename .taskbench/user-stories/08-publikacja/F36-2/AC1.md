---
id: AC1
story: F36-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Po spełnieniu bramek system atomowo zapisuje jedną rezerwację z unikalnym ID próby, zamówieniem, wersją postu i dokładnym celem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Idempotency-key calculation exists, but comments explicitly say no reservation taken.

## Missing

- Persist atomic attempt reservation bound to order/version/target.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
