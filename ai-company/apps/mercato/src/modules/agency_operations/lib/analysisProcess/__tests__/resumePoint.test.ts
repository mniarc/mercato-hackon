/** @jest-environment node */
import { resumePoint } from '../activity'

const run = (stepId: string, status: string) => ({ stepId, status })

describe('resumePoint — where a re-entered research activity continues', () => {
  it('never resumes a case that has not run or finished cleanly', () => {
    expect(resumePoint([])).toBeNull()
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.5', 'done'), run('3.8', 'done'), run('4.1', 'done'), run('4.2', 'done')])).toBeNull()
  })

  it('resumes the chain group of the step that paused on budget, also when E.1 was opened after it', () => {
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.3', 'done'), run('3.4', 'done'), run('3.5', 'done'), run('3.6', 'paused_budget')])).toBe('3.8')
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.3', 'done'), run('3.4', 'done'), run('3.5', 'done'), run('3.6', 'paused_budget'), run('E.1', 'exception')])).toBe('3.8')
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'paused_budget')])).toBe('3.2')
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.3', 'paused_budget')])).toBe('3.5')
  })

  it('resumes a QA-exhausted run at the QA group', () => {
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.5', 'done'), run('3.6', 'done'), run('3.7', 'to_fix'), run('3.7', 'to_fix'), run('E.1', 'exception')])).toBe('3.8')
  })
})

describe('resumePoint — orphaned and crashed runs', () => {
  it('resumes an orphaned running step (the process died) and a failed step at their group', () => {
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'running')])).toBe('3.2')
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.3', 'failed')])).toBe('3.5')
  })
  it('resumes at the QA loop when a repair round was in flight', () => {
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('3.5', 'done'), run('3.6', 'done'), run('3.7', 'to_fix'), run('3.2', 'done'), run('3.4', 'running')])).toBe('3.8')
  })
})
