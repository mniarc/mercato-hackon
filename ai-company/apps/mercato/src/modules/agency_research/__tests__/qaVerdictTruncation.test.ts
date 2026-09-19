import { mergeQaVerdict } from '../lib/research/steps/qa'
import type { QaFinding, QaResult } from '../data/schemas/qa'

const finding = (severity: QaFinding['severity'], owner: QaFinding['owner'], fixStep: string | null): QaFinding => ({
  code: 'other', path: 'WEW-USTALENIA.field_map[x]', severity, gap: 'gap detail', owner, fix_step: fixStep, fix_hint: null,
})

describe('mergeQaVerdict — verdict over the full finding set', () => {
  it('does not let a blocking finding past the 20-item cap slip to `ready`', () => {
    const validator: QaFinding[] = [
      ...Array.from({ length: 20 }, () => finding('major', 'agent', '3.3')),
      finding('blocking', 'agent', '3.2'),
    ]
    const agent: QaResult = { verdict: 'ready', findings: [], summary: 'agent saw nothing blocking' }

    const merged = mergeQaVerdict(agent, validator)
    expect(merged.verdict).toBe('to_fix')
    expect(merged.findings.some((f) => f.severity === 'blocking')).toBe(true)
    expect(merged.findings.length).toBeLessThanOrEqual(20)
  })
})
