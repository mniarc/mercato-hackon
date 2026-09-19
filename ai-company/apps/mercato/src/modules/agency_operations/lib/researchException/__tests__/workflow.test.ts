import { workflowStepSchema, workflowTransitionSchema } from '@open-mercato/core/modules/workflows/data/validators'
import { createResearchExceptionFragment } from '../workflow'

test('native employee task only records continued hold; no approval or restart', () => {
  const fragment = createResearchExceptionFragment()
  fragment.steps.forEach((step) => expect(workflowStepSchema.safeParse(step).success).toBe(true))
  fragment.transitions.forEach((transition) => expect(workflowTransitionSchema.safeParse(transition).success).toBe(true))
  expect(fragment.steps).toHaveLength(1)
  expect(fragment.steps[0]).toMatchObject({ stepId: 'research_exception', stepType: 'USER_TASK', userTaskConfig: { assignedToRoles: ['employee'] } })
  expect(fragment.steps[0].userTaskConfig?.decisions?.map((decision) => decision.id)).toEqual(['keep_blocked'])
  expect(fragment.transitions).toEqual([{ transitionId: 'research_exception_keep_blocked', fromStepId: 'research_exception', toStepId: 'waiting', trigger: 'manual' }])
})
