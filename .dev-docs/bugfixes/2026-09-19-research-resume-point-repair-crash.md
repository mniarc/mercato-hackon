# A crashed QA repair round resumed at the analysis group, not the QA group

- **Date:** 2026-09-19
- **Branch:** `bugfixes/analysis-resume-point` (from `bugfixes/main`)
- **Area:** `agency_operations` analysis process — `resumePoint`
- **Regression test:** `ai-company/tests/regression/research-resume-point-repair-crash.test.ts`

## Symptom

When a paid analysis was resumed after crashing **during a QA repair round**, it
restarted from the analysis group (e.g. `3.5`) and re-ran analysis steps the
repair had already redone — wasting paid model budget and risking divergence
from the repaired state — instead of resuming at the QA group (`3.8`).

## Root cause

`resumePoint` (`agency_operations/lib/analysisProcess/activity.ts`) documents the
rule:

> A repair loop in flight (a 3.7 verdict exists) resumes at the QA group,
> whatever step the repair was on.

It implements that rule with an `inRepair` flag, but the flag is gated on the
**last** run being a `3.x` step:

```ts
const inRepair = last.stepId.startsWith('3.') && <latest 3.7 is 'to_fix'>
```

Exceptions, however, are recorded as a **separate `E.1` step**, so when a run
ends in an exception the `last` step is `E.1` — which never starts with `3.` —
and `inRepair` is always `false` in the exception branch. That branch instead
resumed at `GROUP_OF[<last non-E.1 step>]`:

```ts
if (last.status === 'exception') {
  const before = ordered.filter((run) => run.stepId !== 'E.1').pop()
  return before ? (GROUP_OF[before.stepId] ?? null) : null   // e.g. 3.4 → '3.5'
}
```

So an identical interrupted repair round resumed **differently** depending on how
it stopped: the tests already assert that a repair step left *orphaned-running*
resumes at `3.8`, but the same round *crashed into E.1* fell through to the
analysis group of whatever step the repair last touched (`3.4` → `3.5`).

## Fix

Make the exception branch honour the in-flight repair the same way the
running/failed branch does — the repair signal is "a 3.7 `to_fix` verdict exists
and the interrupted step is in the 3.x chain", independent of whether that step
is still running or has been replaced by an `E.1` row:

```ts
const repairing = <latest 3.7 is 'to_fix'>
const inRepair = last.stepId.startsWith('3.') && repairing
...
if (last.status === 'exception') {
  const before = ordered.filter((run) => run.stepId !== 'E.1').pop()
  if (before?.stepId.startsWith('3.') && repairing) return '3.8'
  return before ? (GROUP_OF[before.stepId] ?? null) : null
}
```

A non-repair exception (no `3.7` verdict in flight) is unchanged, and the
budget-pause branches are untouched. All 52 existing `analysisProcess` tests —
including the 6 `resumePoint` cases — stay green.

## Proof (red → green)

```bash
# from ai-company/
node node_modules/jest/bin/jest.js --config jest.regression.cjs research-resume-point
```

- **Before the fix:** the crashed-repair case returned `'3.5'` while the
  orphaned-running case returned `'3.8'` — the assertion that both resume at
  `'3.8'` failed.
- **After the fix:** both return `'3.8'`; the non-repair exception still returns
  its interrupted-step group.
