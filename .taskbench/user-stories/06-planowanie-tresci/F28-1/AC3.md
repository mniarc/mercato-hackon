---
id: AC3
story: F28-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Zmiana wyboru tematu w tej samej realizacji aktualizuje zależne instrukcje; nie uruchamia równolegle drugiego postu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postInstructionExecution/run.ts` — Compiler detects superseded selection and can build current selection-specific instruction.

## Missing

- Atomic single-post replacement/invalidation after a later topic change is not wired; do not claim a safe full reselection loop.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
