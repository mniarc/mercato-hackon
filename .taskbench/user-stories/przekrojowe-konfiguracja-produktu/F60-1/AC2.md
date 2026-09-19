---
id: AC2
story: F60-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Zamówienie zachowuje przypisaną wersję oferty, a instancja procesu wersje schematu, limitów i używanych wzorców; późniejsza edycja konfiguracji nie podmienia ich bez śladu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Demo purchase preserves offer/terms snapshot and workflow definition reference; phase claims save inputs/limits.

## Missing

- Workflow definition rows/global prompt/model/template configuration can still change outside immutable per-run snapshots.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
