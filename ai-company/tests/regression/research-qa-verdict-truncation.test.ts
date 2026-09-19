/** @jest-environment node */
import { mergeQaVerdict } from '@/modules/agency_research/lib/research/steps/qa'
import type { QaFinding, QaResult } from '@/modules/agency_research/data/schemas/qa'

/**
 * Regression: `mergeQaVerdict` must decide the verdict over ALL findings, and must
 * keep blocking findings within the stored cap.
 *
 * It used to build `[...validator, ...agent.findings].slice(0, 20)` and then read
 * the verdict off that truncated list. `validatorFindings` has no size cap (one
 * finding per unresolved citation, empty must-field, proof card, competitor, …),
 * so a blocking finding past index 20 was dropped: the analysis was marked `ready`
 * even with an unrepaired blocking defect, and the loop (`result.findings.filter
 * blocking`) had nothing to route a repair to.
 */
const finding = (severity: QaFinding['severity'], owner: QaFinding['owner'], fixStep: string | null): QaFinding => ({
  code: 'other', path: 'WEW-USTALENIA.field_map[x]', severity, gap: 'gap detail', owner, fix_step: fixStep, fix_hint: null,
})

describe('mergeQaVerdict — verdict over the full finding set', () => {
  it('does not let a blocking finding past the 20-item cap slip to `ready`', () => {
    // 20 non-blocking validator findings, then one blocking one an agent step can fix.
    const validator: QaFinding[] = [
      ...Array.from({ length: 20 }, () => finding('major', 'agent', '3.3')),
      finding('blocking', 'agent', '3.2'),
    ]
    const agent: QaResult = { verdict: 'ready', findings: [], summary: 'agent saw nothing blocking' }

    const merged = mergeQaVerdict(agent, validator)
    expect(merged.verdict).toBe('to_fix')
    // The loop routes repairs off the stored findings, so the blocking one must survive the cap.
    expect(merged.findings.some((f) => f.severity === 'blocking')).toBe(true)
    expect(merged.findings.length).toBeLessThanOrEqual(20)
  })
})
