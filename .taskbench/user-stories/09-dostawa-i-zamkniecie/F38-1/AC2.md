---
id: AC2
story: F38-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Każda pozycja wskazuje konkretną końcową wersję lub dowód; dokumenty KLI mają właściwe aktualne akceptacje.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — Manifest pins document versions; approvalStateOf mostly reads status.

## Missing

- Require authoritative exact current acceptance receipts and consistency, not status-only package approval.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
