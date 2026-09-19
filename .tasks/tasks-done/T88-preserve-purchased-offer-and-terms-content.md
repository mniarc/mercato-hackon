# T88 - Read the purchased offer and terms after catalogue changes

State: done
Depends on: delivered T25 native purchase; coordinate orderBootstrap edits with T87
Sources: F02-2 AC3; preserve F02-2 AC1/4/5
Owns: `agency_operations/lib/orderBootstrap` purchase snapshot/read seam and its
focused checks; existing `agency/components/purchase/DemoPurchaseStatus` read-only
history section and necessary EN/PL labels (coordinator approved).
Existing purchase hook retains the acknowledged order ID in the URL and reloads
through the same scoped GET; no additional page or browser data store.

Verification: snapshot, purchase-service and existing portal suites passed (3
suites, 31 checks). No new native headed or live-model proof is claimed.

## Original gap

`nativeSales.ts` previously stored version IDs and buyer values in `agencyPurchase`, but not
the accepted terms/offer content. `demoOffer.ts` only exposes current text. The
paid-case attachment captures an offer later at activation, not the terms at
purchase; it cannot preserve an unpaid order's original version after edits.
T25 is delivered and T24 covers execution configuration, neither owns this read.

## Deliver

- Preserve the exact server-owned offer/terms content at purchase acceptance,
  alongside existing IDs/time. Reuse native Sales metadata and line catalogue
  snapshots/conversion; no separate negotiated contract or version-store framework.
- Return the saved version through the scoped existing purchase read surface.
  Catalogue changes and payment retry must not rewrite it. Preserve original
  Polish text; legacy orders without a snapshot report unavailable history rather
  than presenting today's text as what the customer accepted.

## Done when

A focused create/read/retry check changes the current offer and still reads the
original purchased terms/catalogue version. Foreign customer reads stay denied.
Demo-only terms remain demo-only; no real-sale, payment or agent authorization.
