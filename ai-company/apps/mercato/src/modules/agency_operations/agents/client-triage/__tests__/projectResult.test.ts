/** @jest-environment node */
import { projectClientTriageResult } from '../projectResult'
import { inputSchema, clientTriageInterpretationSchema, type ClientTriageInterpretation } from '../contract'

const scope = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003',
  caseId: '00000000-0000-4000-8000-000000000004',
  submissionId: '00000000-0000-4000-8000-000000000005',
  workflowInstanceId: '00000000-0000-4000-8000-000000000006',
}
const interpretation: ClientTriageInterpretation = {
  parts: [{ intent: 'question', summary: 'Asks what happens next', rationale: 'The client asks about the next step.', needsClarification: false, recommendedDisposition: 'answer' }],
  rationale: 'A question can be answered without applying a business mutation.',
  recommendedDisposition: 'answer',
  responseMessage: 'Your submission is available for review.',
}

test('projects only the server-authorized target and never applies effects', () => {
  expect(projectClientTriageResult(scope, interpretation, ['answered'])).toMatchObject({ disposition: { kind: 'answer', targetStepId: 'answered' }, effectsApplied: false })
  expect(projectClientTriageResult(scope, interpretation, ['client_reply'])).toMatchObject({ disposition: null, unappliedReason: 'target_not_authorized' })
  expect(clientTriageInterpretationSchema.safeParse({ ...interpretation, targets: { caseId: scope.caseId } }).success).toBe(false)
})

test('keeps unauthorized approval and mixed parts unapplied', () => {
  const approvalPart = { ...interpretation.parts[0], intent: 'approval', recommendedDisposition: 'approve' }
  expect(projectClientTriageResult(scope, { ...interpretation, parts: [approvalPart], recommendedDisposition: 'approve' }, ['answered', 'client_reply'])).toMatchObject({ disposition: null, unappliedReason: 'target_not_authorized', interpretation: { recommendedDisposition: 'approve' } })
  expect(projectClientTriageResult(scope, { ...interpretation, parts: [...interpretation.parts, approvalPart] }, ['answered'])).toMatchObject({ disposition: null, unappliedReason: 'mixed_dispositions' })
})

test('permits exact brief approval only when every part is an unambiguous approval', () => {
  const approval: ClientTriageInterpretation = { ...interpretation, parts: [{ ...interpretation.parts[0], intent: 'approval', recommendedDisposition: 'approve' }], recommendedDisposition: 'approve', responseMessage: null }
  expect(projectClientTriageResult(scope, approval, ['brief_accepted'])).toMatchObject({ disposition: { kind: 'approve', targetStepId: 'brief_accepted' }, effectsApplied: false })
  for (const part of [
    { ...approval.parts[0], intent: 'change' }, { ...approval.parts[0], intent: 'hold' },
    { ...approval.parts[0], needsClarification: true }, { ...approval.parts[0], recommendedDisposition: 'change' },
  ]) {
    expect(projectClientTriageResult(scope, { ...approval, parts: [approval.parts[0], part] }, ['brief_accepted']).disposition).toBeNull()
  }
})

test('uncertainty cannot become an answer, while a grounded clarification can use the existing waiting step', () => {
  const uncertainPart = { ...interpretation.parts[0], intent: null, needsClarification: true }
  expect(projectClientTriageResult(scope, { ...interpretation, parts: [uncertainPart] }, ['answered'])).toMatchObject({ disposition: null, unappliedReason: 'uncertainty_not_clarified' })
  expect(projectClientTriageResult(scope, {
    ...interpretation, parts: [{ ...uncertainPart, recommendedDisposition: 'clarify' }], recommendedDisposition: 'clarify', responseMessage: 'Which outcome do you mean?',
  }, ['client_reply'])).toMatchObject({ disposition: { kind: 'clarify', targetStepId: 'client_reply' }, effectsApplied: false })
})

test('keeps original client input but strips deterministic routing hints', () => {
  expect(inputSchema.parse({ original: { eventId: 'event-1', text: 'What happens next?', scaffoldScenario: 'clarify' } })).toEqual({ original: { eventId: 'event-1', text: 'What happens next?' } })
})

test('routes supplied brief answers only with a server-bound revision target, without granting approval', () => {
  const change: ClientTriageInterpretation = { ...interpretation,
    parts: [{ ...interpretation.parts[0], intent: 'change', recommendedDisposition: 'change' }],
    recommendedDisposition: 'change', responseMessage: null }
  expect(projectClientTriageResult(scope, change, ['answered', 'client_reply']))
    .toMatchObject({ disposition: null, unappliedReason: 'target_not_authorized' })
  expect(projectClientTriageResult(scope, change, ['brief_revision']))
    .toMatchObject({ disposition: { kind: 'change', targetStepId: 'brief_revision' }, effectsApplied: false })
  expect(projectClientTriageResult(scope, { ...change, parts: [...change.parts, interpretation.parts[0]] }, ['brief_revision']).disposition).toBeNull()
})
