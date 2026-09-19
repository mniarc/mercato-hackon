# T74 - Attach customer material to the existing case

State: done
Sources: F04-2 AC3-4; F05-2 AC1-4; native case/submission and attachment contracts.

## Deliver

- Replace the portal's default new-case/no-op upload with owned-case selection or
  case context and a supplementary private native attachment.
- Preserve the purchase receipt, original case, and history; save the client's
  original text/material reference and dispatch through existing native G when
  configured. Missing configuration preserves a clearly waiting saved submission.
- Keep explicit analysis/ToV developer/service entry points; do not ask customers
  for internal agent JSON, invent order data, or invoke paid research on upload.

Owns: portal Materials component, route/bridge/validator and adjacent checks;
operations material-intake service/contracts and submission attachment/native
pending seam; new material translation keys only. T75 owns paid-case research
bootstrap separately.

## Done when

Owned-case upload creates one supplementary attachment and saved submission,
never a second case or replacement purchase receipt. Foreign case/attachment is
rejected; native-disabled state does not run a deterministic production worker.
Focused boundary checks authored; coordinator owns runtime and verification.

Verification evidence: focused upload, scope, replay and native-dispatch checks
passed. TC-AGENCY-002 on 2026-09-19 exercised real signup/payment/case creation,
then uploaded a private supplementary file to that same case. The saved submission
reached native G and retained the original purchase attachment. Later research
failed at competitor extraction 3.4; this proves intake, not the full demo or QA.
