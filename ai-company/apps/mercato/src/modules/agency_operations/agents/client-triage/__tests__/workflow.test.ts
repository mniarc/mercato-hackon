/** @jest-environment node */
import { workflowDefinitionDataSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { resolveAgentOutcomeHandling } from '@open-mercato/core/modules/workflows/lib/outcome-routing'
import { CLIENT_REPLY_SIGNAL, CLIENT_TRIAGE_RESULT_KEY } from '../../../lib/clientSubmissionWorkflow'
import { CLIENT_TRIAGE_EXCEPTION_STEP_ID } from '../../../lib/clientTriageException/workflow'
import { CLIENT_TRIAGE_AGENT_ID } from '../contract'
import { STRATEGY_EXECUTION_FUNCTION, STRATEGY_EXECUTION_RESULT_KEY } from '../../../lib/strategyExecution/contracts'
import {
  CLIENT_TRIAGE_INPUT_KEY, CLIENT_TRIAGE_INTERPRETATION_KEY,
  PREPARE_CLIENT_TRIAGE_FUNCTION, PROJECT_CLIENT_TRIAGE_FUNCTION,
  ACCEPT_BRIEF_FUNCTION,
  nativeClientSubmissionDefinition,
} from '../workflow'

test('validates the complete native workflow including its agent config and exception fragment', () => {
  const definition = workflowDefinitionDataSchema.parse(nativeClientSubmissionDefinition)
  expect(resolveAgentOutcomeHandling(definition, 'triage', 'researcher')).toMatchObject({ kind: 'route', transition: { toStepId: 'route' } })
  expect(resolveAgentOutcomeHandling(definition, 'triage', 'error')).toMatchObject({ kind: 'route', transition: { toStepId: CLIENT_TRIAGE_EXCEPTION_STEP_ID } })
})

test('continues after saved readiness through one asynchronous native activity without automatic paid retries', () => {
  expect(nativeClientSubmissionDefinition.steps.find((step) => step.stepId === 'strategy_readiness')?.stepType).toBe('AUTOMATED')
  expect(nativeClientSubmissionDefinition.transitions.find((transition) => transition.transitionId === 'execute_strategy')).toMatchObject({
    fromStepId: 'strategy_readiness', toStepId: 'strategy_execution', trigger: 'auto',
    activities: [{ activityName: STRATEGY_EXECUTION_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', async: true,
      retryPolicy: { maxAttempts: 1 }, config: { functionName: STRATEGY_EXECUTION_FUNCTION, args: {} } }],
  })
})

test('passes the stored original through native input mapping and projects the saved research result on a transition', () => {
  const triage = nativeClientSubmissionDefinition.steps.find((step) => step.stepId === 'triage')
  expect(triage?.activities).toEqual([expect.objectContaining({ activityType: 'INVOKE_AGENT', config: {
    agentId: CLIENT_TRIAGE_AGENT_ID,
    input: { original: `{{context.${CLIENT_TRIAGE_INPUT_KEY}.result.original}}` },
    onResult: { alwaysAsk: true }, outputMapping: { [CLIENT_TRIAGE_INTERPRETATION_KEY]: 'data' },
  } })])
  expect(nativeClientSubmissionDefinition.transitions).toEqual(expect.arrayContaining([
    expect.objectContaining({ fromStepId: 'prepare', toStepId: 'triage', activities: [expect.objectContaining({
      activityName: CLIENT_TRIAGE_INPUT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: PREPARE_CLIENT_TRIAGE_FUNCTION, args: {} },
    })] }),
    expect.objectContaining({ fromStepId: 'route', toStepId: 'routed', activities: [expect.objectContaining({
      activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: PROJECT_CLIENT_TRIAGE_FUNCTION, args: {} },
    })] }),
  ]))
})

test('routes supported outcomes and records acceptance before completing its approval destination', () => {
  expect(nativeClientSubmissionDefinition.transitions.filter((transition) => transition.fromStepId === 'routed'))
    .toEqual(['answer', 'clarify', 'approve', 'unapplied'].map((kind) => expect.objectContaining({
      toStepId: kind === 'answer' ? 'answered' : kind === 'clarify' ? 'client_reply' : kind === 'approve' ? 'brief_accepted' : 'unapplied',
      condition: { field: `${CLIENT_TRIAGE_RESULT_KEY}.result.kind`, operator: '=', value: kind },
    })))
  expect(nativeClientSubmissionDefinition.transitions.find((transition) => transition.transitionId === 'approve_brief')).toMatchObject({
    activities: [{ activityName: CLIENT_TRIAGE_RESULT_KEY, activityType: 'EXECUTE_FUNCTION', config: { functionName: ACCEPT_BRIEF_FUNCTION, args: {} } }],
  })
  expect(nativeClientSubmissionDefinition.steps.find((step) => step.stepId === 'client_reply')).toMatchObject({
    stepType: 'WAIT_FOR_SIGNAL', signalConfig: { signalName: CLIENT_REPLY_SIGNAL },
  })
})
