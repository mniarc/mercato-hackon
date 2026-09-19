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

test('G mount keeps the same employee decision but returns to its own unsupported wait', () => {
  const fragment = createResearchExceptionFragment({ waitingStepId: 'post_exception_waiting', neutralWording: true })
  expect(workflowStepSchema.safeParse(fragment.steps[0]).success).toBe(true)
  expect(workflowTransitionSchema.safeParse(fragment.transitions[0]).success).toBe(true)
  expect(fragment.steps[0].userTaskConfig?.decisions?.map((decision) => decision.id)).toEqual(['keep_blocked'])
  expect(fragment.transitions[0]).toMatchObject({ fromStepId: 'research_exception', toStepId: 'post_exception_waiting', trigger: 'manual' })
  expect(fragment.steps[0].userTaskConfig?.instructions).toMatchObject({ en: expect.stringContaining('cannot approve content, increase a budget, restart production or publish') })
})
