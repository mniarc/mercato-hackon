---
id: AC4
story: F06-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Aktywacja przekazuje zadanie zebrania źródeł do 3.2 z danymi firmy i adresem WWW.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/activity.ts` — Native async activity passes scoped order and URL to real runResearch; T58 authored, connected run not yet proved.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
