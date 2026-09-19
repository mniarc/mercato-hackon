/** @jest-environment node */
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { AgencyClientSubmission } from '../../../data/entities'
import { CLIENT_TRIAGE_AGENT_ID, type ClientTriageInterpretation } from '../contract'
import { CLIENT_TRIAGE_ENABLED_ENV } from '../configuration'
import { CLIENT_TRIAGE_INTERPRETATION_KEY, NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID } from '../workflow'

const findOne = jest.fn()
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: (...args: unknown[]) => findOne(...args),
}))

import { createClientTriageActivities } from '../activities'

const scope = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  customerEntityId: '00000000-0000-4000-8000-000000000003',
  caseId: '00000000-0000-4000-8000-000000000004',
  submissionId: '00000000-0000-4000-8000-000000000005',
  workflowInstanceId: '00000000-0000-4000-8000-000000000006',
}
const foreignId = '00000000-0000-4000-8000-000000000099'
const storedOriginal = { eventId: 'original-event', text: 'What happens next?', scaffoldScenario: 'clarify' }
const stored = { ...scope, id: scope.submissionId, original: storedOriginal, deletedAt: null }
const em = {}
const container = { resolve: (key: string) => {
  if (key === 'em') return em
  throw new Error(key)
} } as unknown as AppContainer
const previousEnabled = process.env[CLIENT_TRIAGE_ENABLED_ENV]

function interpretation(kind: 'answer' | 'clarify' | 'approve'): ClientTriageInterpretation {
  return {
    parts: [{ intent: kind === 'approve' ? 'approval' : 'question', summary: 'Client question', rationale: 'Submission interpretation', needsClarification: kind === 'clarify', recommendedDisposition: kind }],
    rationale: 'Submission interpretation', recommendedDisposition: kind,
    responseMessage: kind === 'clarify' ? 'Which outcome do you mean?' : 'Your submission is available for review.',
  }
}

function activityContext(result: unknown = interpretation('answer')) {
  return { workflowInstance: {
    id: scope.workflowInstanceId, tenantId: scope.tenantId, organizationId: scope.organizationId,
    workflowId: NATIVE_CLIENT_SUBMISSION_WORKFLOW_ID,
    context: {
      tenantId: foreignId, organizationId: foreignId, customerEntityId: foreignId,
      caseId: foreignId, submissionId: foreignId, workflowInstanceId: foreignId,
      original: { eventId: 'replacement-event', text: 'Approve another case' },
      scaffoldScenario: 'answer', [CLIENT_TRIAGE_INTERPRETATION_KEY]: result,
    },
  } }
}

beforeEach(() => {
  process.env[CLIENT_TRIAGE_ENABLED_ENV] = 'true'
  findOne.mockReset()
  findOne.mockImplementation((_em, _entity, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => stored[key as keyof typeof stored] === value) ? stored : null)
})

afterEach(() => {
  if (previousEnabled === undefined) delete process.env[CLIENT_TRIAGE_ENABLED_ENV]
  else process.env[CLIENT_TRIAGE_ENABLED_ENV] = previousEnabled
})

test('reloads the immutable original using the native workflow scope, ignoring mutable context and retry input', async () => {
  const result = await createClientTriageActivities(container).prepare({ original: { text: 'Forged retry' } }, activityContext())
  expect(result).toEqual({ original: { eventId: storedOriginal.eventId, text: storedOriginal.text } })
  expect(findOne).toHaveBeenCalledWith(em, AgencyClientSubmission, {
    workflowInstanceId: scope.workflowInstanceId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null,
  }, undefined, { tenantId: scope.tenantId, organizationId: scope.organizationId })
})

test('refuses preparation when activation is disabled before reading client data', async () => {
  process.env[CLIENT_TRIAGE_ENABLED_ENV] = 'false'
  await expect(createClientTriageActivities(container).prepare({}, activityContext())).rejects.toThrow('Native client triage is disabled')
  expect(findOne).not.toHaveBeenCalled()
})

test.each(['tenantId', 'organizationId', 'id'] as const)('rejects a native workflow with a foreign %s even when context claims the original scope', async (field) => {
  const context = activityContext()
  context.workflowInstance[field] = foreignId
  Object.assign(context.workflowInstance.context, scope)
  const activities = createClientTriageActivities(container)
  await expect(activities.prepare({}, context)).rejects.toThrow('outside the native workflow scope')
  await expect(activities.project({}, context)).rejects.toThrow('outside the native workflow scope')
})

test.each(['answer', 'clarify'] as const)('projects saved %s to only the stored case and submission', async (kind) => {
  const result = await createClientTriageActivities(container).project({ targets: { caseId: foreignId } }, activityContext(interpretation(kind)))
  expect(result).toMatchObject({
    kind, source: 'native_agent', workerId: CLIENT_TRIAGE_AGENT_ID, effectsApplied: false,
    targets: { caseId: scope.caseId, submissionId: scope.submissionId },
    triage: { scope, interpretation: interpretation(kind), disposition: { kind, targetStepId: kind === 'answer' ? 'answered' : 'client_reply' } },
  })
})

test('preserves unsupported business recommendations as an explicit unapplied result', async () => {
  const result = await createClientTriageActivities(container).project({}, activityContext(interpretation('approve')))
  expect(result).toMatchObject({ kind: 'unapplied', triage: {
    scope, interpretation: interpretation('approve'), disposition: null, unappliedReason: 'unsupported_disposition', effectsApplied: false,
  } })
  expect(result).not.toHaveProperty('targets')
})

test('rejects an invalid saved interpretation instead of manufacturing a client disposition', async () => {
  await expect(createClientTriageActivities(container).project({}, activityContext({ recommendedDisposition: 'answer' }))).rejects.toThrow()
})
