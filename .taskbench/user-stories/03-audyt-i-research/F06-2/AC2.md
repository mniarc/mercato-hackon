---
id: AC2
story: F06-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Każde pozyskane źródło ma adres lub odwołanie, datę pobrania, wykorzystane fragmenty, pochodzenie i informację o dostępności.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/store.ts` — Collected source stores URL, retrieval time, origin, read scope and access; stored text underpins citations.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/materialSources.ts` — Case-bound native attachments retain attachment/submission references, file name, upload time and extracted text under private owner/assignment/partition checks.
- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/__tests__/materialSources.test.ts` — Focused checks record attachment reference, retrieval/read scope, client origin, access state and client_private visibility for extracted text.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
