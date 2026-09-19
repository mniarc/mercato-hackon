---
id: AC4
story: F31-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Jeżeli dowód podważa bazowe zaakceptowane założenia, system blokuje zależne wykonanie i prosi klienta o wyjaśnienie konkretnej sprzeczności. Samo pytanie nie uruchamia G; odpowiedź klienta przechodzi G i wskazuje potrzebne aktualizacje oraz ponowne akceptacje.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/handoff.ts` — Native employee exception and exact-document questions exist.

## Missing

- Detect foundational contradiction, hold affected dependencies and route subsequent client answer through G for scoped updates.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
