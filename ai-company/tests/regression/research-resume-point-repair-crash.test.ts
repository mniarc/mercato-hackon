/** @jest-environment node */
import { resumePoint } from '@/modules/agency_operations/lib/analysisProcess/activity'

const run = (stepId: string, status: string) => ({ stepId, status })

/**
 * Regression: `resumePoint` — a QA repair round that crashes must resume at the
 * QA group, like one left orphaned-running.
 *
 * The activity documents the rule "a repair loop in flight (a 3.7 verdict
 * exists) resumes at the QA group, whatever step the repair was on", and the
 * running/failed branch honours it (`inRepair ? '3.8'`). But `inRepair` is gated
 * on `last.stepId.startsWith('3.')`, and an exception is recorded as a separate
 * `E.1` step — so in the exception branch `inRepair` is always false. A repair
 * round (3.7 = to_fix) that re-ran an analysis step (3.2, 3.4 …) and then crashed
 * used to resume at that step's analysis group (3.5) instead of the QA group
 * (3.8), re-running paid analysis work that the repair had already redone.
 */
describe('resumePoint — an interrupted QA repair round', () => {
  const repairThatReranAnalysis = [
    run('3.5', 'done'), run('3.6', 'done'), run('3.7', 'to_fix'),
    run('3.2', 'done'), run('3.4', 'done'),
  ]

  it('resumes at the QA group whether the last repair step crashed or was left running', () => {
    // Baseline the codebase already guarantees: the repair step left orphaned-running.
    expect(resumePoint([...repairThatReranAnalysis, run('3.4', 'running')])).toBe('3.8')
    // The same round, but the last repair step crashed into an E.1 exception.
    expect(resumePoint([...repairThatReranAnalysis, run('E.1', 'exception')])).toBe('3.8')
  })

  it('still resumes a non-repair exception at the interrupted step group', () => {
    // No 3.7 verdict in flight → the exception recovery is unchanged.
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('E.1', 'exception')])).toBe('3.2')
  })
})
