# T69 - Connect a fresh verified account to its first agency order

State: done (bounded self-service demo onboarding; committed `b29dffc5f`)
Depends on: T25 purchase; coordinate T65 purchase changes
Owns: proposed `agency_operations/lib/customerOnboarding/**`, `agency/api/portal/onboarding/route.ts`, and `agency/components/customer-onboarding/**`; coordinator agrees native service/configuration and existing purchase-page wiring before source edits
Sources: F02-1, F03-1; explicit user requirement for new-account first purchase; native customer_accounts signup/session and customers command contracts

## Deliver

- Preserve native signup, email verification and login. Complete only the missing
  scoped CRM customer/company link before calling the existing purchase flow.
- Reuse `customers.companies.create` through the native command bus with genuine
  authorized execution context and purchase company/brand/website inputs. Keep
  customer identity server-bound; retries must retain one link and one order.
- Native `CustomerUserService` has no public linkage method; current linkage is
  staff-only `api/admin/users/[id].ts`. Agree a narrow reusable native service seam
  preserving ownership checks and update side effects; do not bypass that boundary
  with an app-owned foreign-key write or fabricated staff credentials.
- Refresh through `/api/customer_accounts/portal/sessions-refresh` after linkage
  so the existing purchase bridge receives the real `customerEntityId` claim.
  Preserve teammate copy and purchase behavior for already-linked users.

## Approved ownership boundary

The user approved verified, currently unlinked customers creating their own new
scoped company/customer and proceeding to the demo order without staff approval.
Never join an existing company from an email domain, typed name, URL or
caller-supplied ID. Preserve native signup/auth and existing membership links.

## Done when

One genuinely fresh verified account reaches its first existing demo order without
staff-created customer fixtures; replay preserves the customer and order, and a
foreign/existing company cannot be claimed. Use focused linkage checks and the
existing purchase journey. No new authentication, paid calls or real charges.

## Evidence

Focused onboarding/linkage checks passed (14 tests). Updated TC-AGENCY-003 passed
headed on the persistent runtime: anonymous signup, captured-email verification,
new-company linkage, failed-payment retry on the same order, and one paid case
awaiting execution. No prelinked account or verification writes in the fixture;
owned records cleaned up. Research after payment remains T75, not this proof.
