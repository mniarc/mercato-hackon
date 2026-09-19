---
id: AC1
story: F60-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Uprawniona agencja zatwierdza wersje STD-OFERTA, STD-PROCES, STD-LIMITY oraz wymaganych WZR przed uruchomieniem produktu. Przy starcie realizacji w 2.3 wersje schematu i limitów są już dostępne do przypięcia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/contracts.ts` — Trusted explicit analysis policy and approved demo offer/terms are available.

## Missing

- Not all STD-PROCES/STD-LIMITY/WZR versions have agency-approved immutable configuration.

## Decision Required

- T24: approved process, template and task-limit versions beyond the demo purchase.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
