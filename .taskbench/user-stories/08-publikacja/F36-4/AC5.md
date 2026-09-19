---
id: AC5
story: F36-4
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Wstrzymanie po starcie nie jest traktowane jako dowód niewysłania i nie uprawnia do ponowienia w ciemno.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No attempt is retried in current document-only lane.

## Missing

- Enforce no-blind-retry against actual post-start hold/unknown attempts.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
