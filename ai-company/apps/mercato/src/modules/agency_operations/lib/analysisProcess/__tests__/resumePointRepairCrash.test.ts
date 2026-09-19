import { resumePoint } from '../activity'

const run = (stepId: string, status: string) => ({ stepId, status })

describe('resumePoint — an interrupted QA repair round', () => {
  const repairThatReranAnalysis = [
    run('3.5', 'done'), run('3.6', 'done'), run('3.7', 'to_fix'),
    run('3.2', 'done'), run('3.4', 'done'),
  ]

  it('resumes at the QA group whether the last repair step crashed or was left running', () => {
    expect(resumePoint([...repairThatReranAnalysis, run('3.4', 'running')])).toBe('3.8')
    expect(resumePoint([...repairThatReranAnalysis, run('E.1', 'exception')])).toBe('3.8')
  })

  it('still resumes a non-repair exception at the interrupted step group', () => {
    expect(resumePoint([run('3.1', 'done'), run('3.2', 'done'), run('E.1', 'exception')])).toBe('3.2')
  })
})
