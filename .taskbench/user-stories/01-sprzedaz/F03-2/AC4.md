---
id: AC4
story: F03-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Płatność odrzucona, oczekująca lub rezygnacja klienta nie uruchamiają 2.2–2.3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — Activation remains conditional on verified captured status and exact money/order binding.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 proves failed and replacement-pending receipts have no case/workflow before capture. Client cancellation is not exercised, so full native criterion verification remains not_run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
