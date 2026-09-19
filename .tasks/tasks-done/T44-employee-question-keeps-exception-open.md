# T44 - Ask the client from an employee exception without resolving it

State: done
Sources: F49-2, F50-2
Owns: `agency_operations/lib/employeeQuestions/**`, `api/cases/[id]/questions/**`, `AgencyCaseEmployeeQuestions.tsx` and adjacent focused tests; additive CLI, case mount and own en/pl keys
Context: Native employee tasks and the standard customer task form already exist; the teammate portal delegates ordinary forms to that renderer. Reuse native task access and normal G intake.

## Deliver

- An authorized employee records a question against an open case exception and optional exact case-owned brief version. Create a native customer task; never complete or signal the employee exception.
- Only the assigned customer's persisted answer enters G as a retry-stable original submission. Retain immutable question/exception/version binding; the staff question is not client input or client approval.
- Show saved question, answer receipt and native task links in the existing employee case. No new inbox, messages framework, deadlines or automatic resolution.

## Done when

Focused checks cover task authority, case/version isolation, staff-vs-customer provenance and replay; coordinator wires the island and proves the real customer response path. Other document types and full F50 resumption policy are not claimed.

Enable explicitly with `agency_operations configure-employee-questions --tenant <uuid> --organization <uuid> --user <authorized-staff-uuid>`. Asking stays unavailable until the owned native definition is configured. Runtime proof remains coordinator-owned.

Delivery evidence: `23bc9e681` and the passing canonical headed journey (2026-09-19)
exercise the real employee question, exact post-version customer answer and G
receipt while the parent exception remains open. Focused service checks cover
authority and replay. T55 extends document selection; producer resumption remains
outside this task.
