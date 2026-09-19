import { expect, type Page } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { STRATEGY_PAIR_REVIEW_CONTEXT_KEY, STRATEGY_PAIR_REVIEW_WORKFLOW_ID, strategyPairInvitationSchema } from '../../../lib/strategyPairReview/contracts'
import { nativeTovRevisionResultSchema, TOV_REVISION_RESULT_KEY } from '../../../lib/tovRevision/contracts'
import { readInvitation, type JourneyScope } from './records'
import { TOV_CORRECTION_TEXT } from './tovIntelligence'
import type { createProductionJourneyIntelligence } from './intelligence'

/** Opt-in alternative within the same journey: real response/producer/version/review, not a seeded correction. */
export async function completeTovCorrection(input: {
  page: Page; scope: JourneyScope; caseId: string;
  invitation: Awaited<ReturnType<typeof readInvitation>>;
  intelligence: Pick<ReturnType<typeof createProductionJourneyIntelligence>, 'allowPairCorrection'>;
  openTask(taskId: string): Promise<unknown>;
  continueNativeResponse(): Promise<void>;
}) {
  const { page, scope, caseId, invitation } = input
  const previous = strategyPairInvitationSchema.parse(invitation.context[STRATEGY_PAIR_REVIEW_CONTEXT_KEY]).review
  input.intelligence.allowPairCorrection({ taskId: invitation.taskId, strategy: previous.strategy, tov: previous.tov })
  await input.openTask(invitation.taskId)
  await page.locator('[data-crud-field-id="kind"]').getByRole('combobox').click()
  await page.getByRole('option', { name: 'Comments or a question', exact: true }).click()
  await page.locator('[data-crud-field-id="body"]').getByRole('textbox').fill(TOV_CORRECTION_TEXT)
  const sent = page.waitForResponse(response => new URL(response.url()).pathname === `/api/agency/strategy-reviews/${invitation.taskId}` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Send response', exact: true }).click()
  const response = await sent
  expect(response.ok(), await response.text()).toBeTruthy()
  const receipt = await response.json() as { requestId: string; status: string }
  expect(receipt.status).toBe('response_received')
  await input.continueNativeResponse()

  const saved = await withClient(async client => (await client.query<{
    original: { strategyReviewResponse: { taskId: string; body: string } };
    context: Record<string, unknown>;
  }>(`SELECT s.original,w.context FROM agency_client_submissions s JOIN workflow_instances w ON w.id=s.workflow_instance_id
    AND w.tenant_id=s.tenant_id AND w.organization_id=s.organization_id
    WHERE s.tenant_id=$1 AND s.organization_id=$2 AND s.case_id=$3 AND s.customer_entity_id=$4 AND s.id=$5`,
  [scope.tenantId, scope.organizationId, caseId, scope.customerEntityId, receipt.requestId])).rows[0])
  expect(saved.original.strategyReviewResponse).toMatchObject({ taskId: invitation.taskId, body: TOV_CORRECTION_TEXT })
  expect(saved.context.clientTriageResult).toMatchObject({ result: { triage: { disposition: { kind: 'change', targetStepId: 'tov_revision' } } } })
  const outcome = nativeTovRevisionResultSchema.parse((saved.context[TOV_REVISION_RESULT_KEY] as { result: unknown }).result)
  expect(outcome).toMatchObject({ orderRef: caseId, revision: { status: 'completed', requestId: receipt.requestId,
    previousVersionId: previous.tov.versionId, changedFields: ['addressingTheReader'] } })
  if (outcome.revision.status !== 'completed') throw new Error('The specialist correction did not complete')
  const revised = outcome.revision
  const versions = await withClient(async client => (await client.query<{ id: string }>(
    `SELECT id FROM agency_tov_document_versions WHERE tenant_id=$1 AND organization_id=$2 AND document_id=$3 AND id=ANY($4::uuid[])`,
    [scope.tenantId, scope.organizationId, revised.reference.documentId, [previous.tov.versionId, revised.reference.versionId]],
  )).rows)
  expect(versions.map(version => version.id).sort()).toEqual([previous.tov.versionId, revised.reference.versionId].sort())
  expect(revised.reference.versionId).not.toBe(previous.tov.versionId)
  const next = await readInvitation(scope, caseId, STRATEGY_PAIR_REVIEW_WORKFLOW_ID)
  const review = strategyPairInvitationSchema.parse(next.context[STRATEGY_PAIR_REVIEW_CONTEXT_KEY]).review
  expect(review.strategy.versionId).toBe(previous.strategy.versionId)
  expect(review.tov).toMatchObject({ versionId: revised.reference.versionId, status: 'ready_for_review' })
  expect(review.tov.acceptanceReceipt).toBeUndefined()
  await input.openTask(next.taskId)
  await expect(page.getByRole('checkbox', { name: 'Approve this tone of voice version', exact: true })).toBeEnabled()
  await expect(page.getByRole('checkbox', { name: 'Approve this tone of voice version', exact: true })).not.toBeChecked()
}
