# T25 - Start one agency process from a confirmed paid order

State: done (bounded approved demo purchase and persisted process bootstrap)
Evidence: Headed TC-AGENCY-003 passed on 2026-09-19: real purchase form, native order/gateway session, retry preserving one order, verified signed mock capture, confirmation retry preserving one case, private JSON material and native WAIT_FOR_SIGNAL awaiting_execution. Focused payment/encrypted-lookup/transaction checks and full app typecheck passed. This is zero-charge demo proof, not paid research fulfilment, production payments or full sales-story completion.
Depends on: T24; existing teammate offer/order frontend
Owns: `agency_operations/lib/orderBootstrap/**`; agreed narrow `agency` purchase adapter
Sources: F01-1, F01-2, F02-1, F02-2, F03-1, F03-2, F04-1, F04-2, F04-3, F05-1, F05-2

User approved on 2026-09-19: a demo-only 2,500 PLN offer with versioned demo
terms and zero-charge test payments. This does not approve real charging,
production commercial terms, tax treatment, or paid agent execution.
Pin the server-owned demo offer and accepted terms; client price/status fields
and analysis productSelection are not purchase/payment authority.
Native sales orders/payments and the signed-event `mock_processing` gateway are
available for the zero-charge path; no new billing framework is needed.

## Deliver

- Reuse native customer/order/payment capabilities and teammate purchase UI after
  checking their real contracts. The sales-advisor only explains the pinned offer.
- Persist purchase inputs/terms and retry-stable order/payment initiation; verify
  payment identity, amount/matching and final state before one process activation.
- Connect paid order, customer, product and pinned configuration to the case;
  mismatched/ambiguous payment stays an owned exception, not inferred success.

## Done when

- A labelled test-provider payment starts one persisted process; duplicate delivery
  cannot start another and an invalid payment cannot activate it. Check this boundary
  once; existing portal intake does not prove purchase/payment completion.

## Constraints

- No live charge, guessed price, replacement portal, or new billing engine.
