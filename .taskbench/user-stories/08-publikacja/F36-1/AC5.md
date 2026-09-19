---
id: AC5
story: F36-1
status: implemented
blocking: false
needs_decision: true
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Dopuszczenie jest przypisane do niezmiennej wersji treści i dokładnego celu, nie do dowolnej aktualnej treści w dokumencie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Prepared content hash/version and destination are explicit; no arbitrary current text is substituted.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
