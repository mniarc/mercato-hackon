# T89 - Answer a customer's fixed-offer question before purchase

State: active (source implemented; focused checks passed; connected native proof pending)
Depends on: existing native G and approved demo offer; explicit worker configuration
Sources: F01-2 AC1-5; F01-1 AC5
Owns: bounded `agency_operations/lib/salesQuestions/**` producer/persistence seam
and existing `agents/sales-advisor/**`; coordinator owns shared G contracts and
teammate portal integration. Confirm exclusive paths before assigning implementation.

Implementation: 9 focused checks and app typecheck passed. The joined native
prepurchase question/follow-up path remains unproved; no live-model proof is claimed.

## Original gap

`clientSubmissionService.submit` requires an existing case and
`client-triage/contract.ts` requires its case ID. The sales-advisor definition is
explicitly disabled and has no production caller. T30 mentions prepurchase intake
inside blocked change-impact work, but supplies no independently actionable sales
conversation. T25's done purchase path does not implement F01-2.

## Deliver

- Let an authenticated contact ask about the configured fixed offer without
  creating an order/case. Preserve question, contact, product/version and event ID;
  first reuse native customer interactions and existing typed G classification.
- Invoke the native sales worker only from its saved G decision with the exact
  server-owned offer content. Save/deliver the answer under the same contact and
  product. Do not treat the unused scaffold definition as implemented delivery.
- Reuse teammate portal surfaces for answer, follow-up, purchase link or exit.
  Explain out-of-catalogue requests without negotiating price/scope or starting
  research. Missing worker configuration preserves the question and explicit wait.

## Done when

One connected fixture path classifies a genuine saved prepurchase question,
returns its catalogue-grounded answer and accepts a follow-up without any order,
payment or research run. Focused scope/replay and out-of-catalogue checks cover
the new boundary. No new chatbot framework, paid calls or live-quality claim.
