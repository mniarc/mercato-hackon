---
id: AC3
story: F02-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Wersja warunków i katalogu powiązana z zakupem pozostaje możliwa do odczytania po późniejszej zmianie katalogu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/nativeSales.ts` — T88 captures exact server-owned demo offer and EN/PL terms once in native Sales metadata; conversion and payment retry retain the purchased snapshot and version IDs.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/service.ts` — Customer-scoped reads return stored purchaseHistory; legacy orders explicitly report unavailable historical text rather than today's terms.
- `ai-company/apps/mercato/src/modules/agency/components/purchase/useDemoPurchase.ts` — Acknowledged order URL reloads through the existing ownership-checked GET; invalid or foreign links expose no receipt.
- `ai-company/apps/mercato/src/modules/agency/components/purchase/DemoPurchaseStatus.tsx` — Existing portal displays saved offer, exact stored terms, versions and acceptance time, including explicit legacy unavailability.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/__tests__/purchaseSnapshot.test.ts` — T88 snapshot, service and portal suites passed: 3 suites/31 checks, including catalogue change, scoped read/retry, preserved Polish text and reload. Focused proof only; no new native-app or live-model run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
