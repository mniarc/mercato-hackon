/** @jest-environment node */
import { resumedResearchTaskSteps } from '../lib/researchService'

jest.mock('@open-mercato/web-research', () => ({ assertPublicUrl: jest.fn() }))

test('initial analysis recovery includes in-flight QA repairs but never later phase producers', () => {
  const steps = resumedResearchTaskSteps('3.8', '4.2')
  expect(steps).toEqual(expect.arrayContaining(['3.2', '3.4', '3.7', '3.8', '4.1', '4.2']))
  expect(steps.some((step) => /^[5-9]\./.test(step))).toBe(false)
  expect(resumedResearchTaskSteps('4.2', '4.2')).toEqual(['4.1', '4.2'])
})

test('explicit later CLI ranges retain only their own groups', () => {
  expect(resumedResearchTaskSteps('5.4', '7.3')).toEqual(['5.1', '5.2', '5.3', '5.4', '6.1', '6.2', '6.3', '6.5', '6.7', '7.1', '7.2', '7.3'])
})
