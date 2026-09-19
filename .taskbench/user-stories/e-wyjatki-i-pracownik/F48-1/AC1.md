---
id: AC1
story: F48-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

WEW-ESKALACJA zawiera powód, zgłoszenie lub zdarzenie źródłowe, dowody, wersje oraz blokowane zadanie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/escalate.ts` — Stored escalation carries observed reason, source task, exact input references, evidence and dependent holds.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
