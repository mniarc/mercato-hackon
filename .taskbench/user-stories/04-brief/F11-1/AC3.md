---
id: AC3
story: F11-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Uruchamiany jest właściwy fragment analizy 3.2–3.7 w granicach STD-PROCES i STD-LIMITY, bez pełnego audytu niezwiązanego z pytaniem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/activity.ts` — Only the saved directed field is authorized under a separate explicit material-revision cost cap.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/run.ts` — The 4.5 runner disables unrelated crawling and executes the existing grounded extractor and field mapper only for the requested field.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
