---
id: AC4
story: F03-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Karta zamówienia w OM pokazuje klienta, produkt, cenę i rzeczywisty status płatności.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/nativeSales.ts` — Native Sales owns order/payment records and portal displays payment state.
- `ai-company/packages/core/src/modules/sales/backend/sales/documents/[id]/page.tsx` — Native order route reuses this detail page: CustomerInlineEditor, SalesDocumentItemsSection product/prices, and SalesDocumentPaymentsSection order-scoped payment API status. Source inspected; staff order-card runtime not run.
- `ai-company/packages/core/src/modules/sales/components/documents/PaymentsSection.tsx` — Loads /api/sales/payments for the order and renders persisted statusLabel/status and amount, not browser-derived payment success.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
