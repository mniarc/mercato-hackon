---
id: AC3
story: F36-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Wewnętrzny błąd tekstu wraca do QA 7.3; adapter nie skraca i nie adaptuje zaakceptowanego tekstu po cichu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Length/platform mismatch is a blocker and payload text is unchanged.

## Missing

- Route internal text defect to 7.3 rather than only return a document blocker.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
