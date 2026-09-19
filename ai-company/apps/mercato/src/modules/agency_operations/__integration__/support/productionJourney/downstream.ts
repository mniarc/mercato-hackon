import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { apiRequest } from '@open-mercato/core/helpers/integration/api'
import { PLAN_REVIEW_CONTEXT_KEY, PLAN_REVIEW_WORKFLOW_ID, planReviewInvitationSchema, planReviewReceiptSchema } from '../../../lib/planReview/contracts'
import type { PostReviewService } from '../../../lib/postReview/contracts'
import type { CaseProcessResponse } from '../../../lib/processProjection/contract'
import { publicationPreparationPreparedSchema } from '../../../../agency_research/lib/publicationPreparation/contracts'
import type { createProductionJourneyIntelligence } from './intelligence'
import { readInvitation, type JourneyScope } from './records'

type Input = {
  page: Page
  request: APIRequestContext
  adminToken: string
  scope: JourneyScope
  caseId: string
  baseUrl: string
  orgSlug: string
  intelligence: ReturnType<typeof createProductionJourneyIntelligence>
  continueNativeResponse: () => Promise<void>
  capture: (name: string) => Promise<void>
}

export async function completeProducedPostJourney(input: Input) {
  const { page, intelligence, caseId, scope } = input
  const openTask = (taskId: string) => page.goto(new URL(`/${input.orgSlug}/portal/tasks/${taskId}`, input.baseUrl).toString(), { waitUntil: 'domcontentloaded' })
  const selection = await test.step('Approve the produced plan and explicitly select its topic', async () => {
    console.log('[TC-AGENCY-002] Client chooses a real plan topic; no preaccepted plan or seeded instruction')
    const invitation = await readInvitation(scope, caseId, PLAN_REVIEW_WORKFLOW_ID)
    const review = planReviewInvitationSchema.parse(invitation.context[PLAN_REVIEW_CONTEXT_KEY]).review
    const selected = review.topics.find((topic) => topic.topicId === 'TOP02')
    expect(selected, 'The fixture customer selects an actually offered topic, never an invented topic ID').toBeTruthy()
    intelligence.allowPlanApproval({ ...review.plan, taskId: invitation.taskId, selectedTopicId: selected!.topicId })
    await openTask(invitation.taskId)
    await page.getByRole('checkbox', { name: 'I approve this exact plan version', exact: true }).check()
    await page.locator('[data-crud-field-id="selectedTopicId"]').getByRole('combobox').click()
    await page.getByRole('option', { name: /\(TOP02\)$/ }).click()
    await input.capture('05-client-selects-produced-plan-topic')
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/plan-reviews/${invitation.taskId}`
      && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send response', exact: true }).click()
    const response = await responsePromise
    expect(response.ok(), await response.text()).toBeTruthy()
    const receipt = planReviewReceiptSchema.parse(await response.json())
    intelligence.allowPostProduction({ caseId, planVersion: review.plan.version, selectedTopicId: selected!.topicId,
      selectionSubmissionId: receipt.requestId })
    await input.continueNativeResponse()
    return { submissionId: receipt.requestId, planVersionId: review.plan.versionId, selectedTopicId: selected!.topicId }
  })

  const approved = await test.step('Review and accept the post produced from that actual selection', async () => {
    console.log('[TC-AGENCY-002] Real author/editor and QA must produce the review invitation')
    const invitation = await readInvitation(scope, caseId, 'agency_operations.post-review.v1')
    const projected = await page.request.get(new URL(`/api/agency/post-reviews/${invitation.taskId}`, input.baseUrl).toString())
    expect(projected.ok(), await projected.text()).toBeTruthy()
    const { review, canRespond } = await projected.json() as Awaited<ReturnType<PostReviewService['read']>>
    expect(canRespond).toBe(true)
    intelligence.allowPostApproval({ ...review.post, taskId: invitation.taskId })
    await openTask(invitation.taskId)
    await expect(page.getByRole('heading', { name: 'Review your post', exact: true })).toBeVisible()
    await expect(page.getByText('Content approval applies only to this version. It does not authorize publication.', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'I approve the content of this exact post version', exact: true }).check()
    await input.capture('06-actual-generated-post-content-review')
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/agency/post-reviews/${invitation.taskId}`
      && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send response', exact: true }).click()
    const response = await responsePromise
    expect(response.ok(), await response.text()).toBeTruthy()
    const receipt = await response.json() as Awaited<ReturnType<PostReviewService['respond']>>
    expect(receipt.status).toBe('response_received')
    await input.continueNativeResponse()
    await openTask(invitation.taskId)
    await expect(page.getByText(`Acceptance recorded for version ${review.post.version}.`, { exact: true })).toBeVisible()
    await input.capture('07-post-content-acceptance-recorded')
    return { submissionId: receipt.requestId, postVersionId: review.post.versionId }
  })

  return test.step('Read the actual saved publication preparation with sending disabled', async () => {
    const response = await apiRequest(input.request, 'GET', `/api/agency_operations/cases/${caseId}`, { token: input.adminToken })
    expect(response.ok(), await response.text()).toBeTruthy()
    const process = await response.json() as CaseProcessResponse
    const selected = process.submissions.find((submission) => submission.submissionId === selection.submissionId)
    expect(selected?.postInstruction).toMatchObject({ status: 'ready', planVersionId: selection.planVersionId,
      selectedTopicId: selection.selectedTopicId, selectionSubmissionId: selection.submissionId })
    expect(selected?.postExecution).toMatchObject({ status: 'completed', postVersionId: approved.postVersionId,
      selectionSubmissionId: selection.submissionId, readyForReview: true, qaVerdict: 'pass_for_draft' })
    const accepted = process.submissions.find((submission) => submission.submissionId === approved.submissionId)
    const preparation = publicationPreparationPreparedSchema.parse(accepted?.publicationPreparation)
    expect(preparation).toMatchObject({ orderRef: caseId, postVersionId: approved.postVersionId,
      acceptanceSubmissionId: approved.submissionId, contentApproval: 'valid', publicationConsent: 'missing', canSend: false })
    expect(intelligence.calls).toEqual(expect.arrayContaining(['agency_research.post_author', 'agency_research.post_editor']))
    console.log(`[TC-AGENCY-002] Publication preparation saved as ${preparation.instructionVersionId}; sending disabled, no publication consent invented.`)
    return preparation
  })
}
