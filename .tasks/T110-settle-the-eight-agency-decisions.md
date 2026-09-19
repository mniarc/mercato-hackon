# T110 - Settle the eight agency decisions the coverage report waits for

State: ready (decision work, not code; owner Marcin with Rafał)
Depends on: nothing; unblocks T24, T30, T31, T32 and every criterion flagged "external decision"
Owns: `.dev-docs/adr/004-agency-product-decisions.md` (new) and the STD-* documents it amends
Sources: the 86 criteria with `externalDecision` in `.dev-docs/coverage/assessments`; F01-1, F04-2, F05-2, F26-1, F34-1, F34-2, F35-1, F38-3, F39-1, F60-1

## Deliver

The coverage report lists 86 criteria waiting for a business decision. They are
eight distinct questions, and in this project the agency is us. Record one
answer per question in an ADR and amend the STD documents it touches. Proposed
answers below are defaults to confirm or change, not policy already made.

1. Publication scope and provider (47 criteria): Discord is the supported
   publication channel for this release; the destination configured by T83 is
   authoritative; external sends are authorized once T31's preflight passes.
   LinkedIn/X stay out of scope. -> STD-PUBLIKACJA (new), unblocks T31.
2. Delivery and closure (24): the package is shared through the customer portal
   with a mail notification; three sharing retries, then E; closure requires
   publication proof + shared package + no open hold. -> STD-DOSTAWA, unblocks T32.
3. Producer return step, guided attempts and budget accounting (6, T24/T45): a
   QA repair returns to the owning step; two guided attempts per QA finding;
   repairs spend the order's remaining budget, never a new one; no implicit retry.
4. Publication policy details (5, T31): exact-version + exact-target consent,
   collected in the 7.4 interaction when the target is known; consent is
   invalidated by any new post version or target change.
5. Catalogue version and net price (1): STD-OFERTA v1.1, 2500 PLN net, one
   brand / market / language, one post, unlimited in-package revisions.
6. Topic count (1): 12 topics in the production offer; demo uses the same.
7. Delivery/closure channel (1, T32): as in 2.
8. Approved process, template and limit versions beyond the demo purchase (1,
   T24): STD-PROCES v2, STD-LIMITY v1, template package v1.1 (Rafał's), pinned
   per order by T24.

## Done when

- The ADR exists with the eight answers and who decided; each STD document it
  amends carries a version id the order can pin (T24).
- The eight `externalDecision` entries in the assessments point at the ADR, and
  T30, T31, T32 have their "blocked" state replaced by an actual dependency list.
