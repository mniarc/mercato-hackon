'use client'

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { buildWorkInboxItemHref } from '@open-mercato/core/modules/workflows/lib/work-inbox/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { JsonDisplay } from '@open-mercato/ui/backend/JsonDisplay'
import { CollapsibleSection, SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import type { CaseAnalysisProcess, CaseProcessResponse } from '../../../../../lib/processProjection/contract'

const key = 'agencyOperations.cases.process'

function AnalysisProcess({ analysis }: { analysis: CaseAnalysisProcess }) {
  const translate = useT()
  return (
    <CollapsibleSection title={translate(`${key}.analysis.title`)}>
      <div className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={analysis.awaitingFollowUp ? 'warning' : 'neutral'}>{analysis.status} · {analysis.currentStepId}</StatusBadge>
          <Button type="button" asChild variant="outline">
            <Link href={`/backend/instances/${encodeURIComponent(analysis.id)}`}>
              {translate('agencyOperations.cases.detail.workflow.open')}
            </Link>
          </Button>
        </div>
        <p className="break-all text-xs text-muted-foreground">{analysis.workflowId} · {translate(`${key}.version`)} {analysis.version}</p>
        {analysis.awaitingFollowUp ? <p className="text-sm text-status-warning-text">{translate(`${key}.analysis.waiting`)}</p> : null}
        {analysis.error ? <JsonDisplay data={analysis.error} title={translate('agencyOperations.cases.detail.run.error')} /> : null}
        {analysis.result ? (
          <>
            <p className="text-sm">{translate(`${key}.analysis.result.${analysis.result.state}`)}</p>
            <p className="text-sm text-muted-foreground">{translate(`${key}.analysis.noApproval`)}</p>
            <JsonDisplay data={analysis.result} title={translate(`${key}.analysis.savedHandoff`)} />
            {analysis.result.agentRunIds.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysis.result.agentRunIds.map((id, index) => (
                  <Button key={id} type="button" asChild variant="outline">
                    <Link href={`/backend/traces/${encodeURIComponent(id)}`}>
                      {translate('agencyOperations.cases.detail.research.agentRun')} {index + 1}
                    </Link>
                  </Button>
                ))}
              </div>
            ) : null}
          </>
        ) : <p className="text-sm text-muted-foreground">{translate(`${key}.analysis.noResult`)}</p>}
      </div>
    </CollapsibleSection>
  )
}

export function AgencyCaseProcess({ caseId }: { caseId: string }) {
  const translate = useT()
  const [data, setData] = React.useState<CaseProcessResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [revision, setRevision] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setError(null)
    void apiCall<CaseProcessResponse>(`/api/agency_operations/cases/${encodeURIComponent(caseId)}`)
      .then((response) => {
        if (cancelled) return
        if (!response.ok || !response.result) {
          setError(response.status === 403 ? `${key}.forbidden` : `${key}.loadError`)
          return
        }
        setData(response.result)
      })
      .catch(() => { if (!cancelled) setError(`${key}.loadError`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [caseId, revision])

  return (
    <section className="space-y-4 rounded-lg border bg-card p-6">
      <SectionHeader title={translate(`${key}.title`, 'Case processes')} action={(
        <Button type="button" variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
          {translate('agencyOperations.cases.detail.workflow.refresh')}
        </Button>
      )} />
      {loading ? <LoadingMessage label={translate('agencyOperations.cases.detail.loading')} /> : null}
      {error ? <ErrorMessage label={translate(error)} /> : null}
      {data?.analysis ? <AnalysisProcess analysis={data.analysis} /> : null}
      {data?.submissions.length === 0 ? <p className="text-sm text-muted-foreground">{translate(`${key}.empty`, 'No client submissions recorded.')}</p> : null}
      {data?.hasMore ? <p className="text-sm text-muted-foreground">{translate(`${key}.limited`, 'Showing the latest 100 submissions.')}</p> : null}
      {data?.submissions.map((submission, index) => (
        <CollapsibleSection key={submission.submissionId} title={submission.eventId} defaultCollapsed={index > 0}>
          <div className="space-y-4 pt-4">
            <p className="break-all text-xs text-muted-foreground">{submission.submissionId} · {submission.createdAt}</p>
            {submission.workflow ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={submission.workflow.waitingFor || submission.workflow.routeUnapplied ? 'warning' : 'neutral'}>
                    {submission.workflow.status} · {submission.workflow.currentStepId}
                  </StatusBadge>
                  <StatusBadge variant="neutral">{translate(`${key}.mode.${submission.workflow.mode}`)}</StatusBadge>
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${encodeURIComponent(submission.workflow.id)}`}>
                      {translate('agencyOperations.cases.detail.workflow.open')}
                    </Link>
                  </Button>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  {submission.workflow.workflowId} · {translate(`${key}.version`, 'Version')} {submission.workflow.version}
                </p>
                {submission.workflow.waitingFor ? <p className="text-sm">{translate(`${key}.waiting.${submission.workflow.waitingFor}`)}</p> : null}
                {submission.workflow.routeUnapplied ? <p className="text-sm text-status-warning-text">{translate(`${key}.unapplied`, 'Interpretation saved. Its business route has not been implemented or applied.')}</p> : null}
                {submission.workflow.error ? <JsonDisplay data={submission.workflow.error} title={translate('agencyOperations.cases.detail.run.error')} /> : null}
              </>
            ) : <p className="text-sm text-muted-foreground">{translate(`${key}.missingWorkflow`, 'No linked workflow record is available.')}</p>}
            {submission.disposition ? (
              <div className="space-y-2">
                <p className="whitespace-pre-wrap text-sm">{submission.disposition.message}</p>
                <p className="text-sm text-muted-foreground">{submission.disposition.rationale}</p>
                {!submission.disposition.effectsApplied ? <p className="text-xs text-muted-foreground">{translate(`${key}.noBusinessEffects`, 'This triage result does not approve a document or apply business changes.')}</p> : null}
              </div>
            ) : null}
            {submission.briefRevisionHandoff ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.briefRevision.title`)}</h3>
                <StatusBadge variant={submission.briefRevisionHandoff.status === 'blocked' ? 'warning' : 'neutral'}>
                  {translate(`${key}.briefRevision.${submission.briefRevisionHandoff.status}`)}
                </StatusBadge>
                {submission.briefRevisionHandoff.status === 'blocked' ? (
                  <p className="text-sm">{translate(`${key}.briefRevision.reason`)}: <code>{submission.briefRevisionHandoff.reason}</code></p>
                ) : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.briefRevision.noApprovalOrResume`)}</p>
                {submission.workflow ? (
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${encodeURIComponent(submission.briefRevisionHandoff.status === 'invited'
                      ? submission.briefRevisionHandoff.invitation.workflowInstanceId : submission.workflow.id)}`}>
                      {translate(`${key}.briefRevision.inspectWorkflow`)}
                    </Link>
                  </Button>
                ) : null}
                <JsonDisplay data={submission.briefRevisionHandoff} title={translate(`${key}.briefRevision.title`)} />
              </div>
            ) : null}
            {submission.strategyHandoff ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.strategy.title`)}</h3>
                <p className="text-sm">{translate(`${key}.strategy.${submission.strategyHandoff.status}`)}</p>
                <p className="text-sm text-muted-foreground">{translate(`${key}.strategy.noExecution`)}</p>
                <JsonDisplay data={submission.strategyHandoff} title={translate(`${key}.strategy.title`)} />
              </div>
            ) : null}
            {submission.strategyExecution ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.strategyExecution.title`)}</h3>
                <p className="text-sm">{translate(`${key}.strategyExecution.${submission.strategyExecution.status}`)}</p>
                <p className="text-sm text-muted-foreground">{translate(`${key}.strategyExecution.noApproval`)}</p>
                <JsonDisplay data={submission.strategyExecution} title={translate(`${key}.strategyExecution.title`)} />
              </div>
            ) : null}
            {submission.strategyReviewHandoff?.status === 'blocked' ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.strategyReviewHandoff.title`)}</h3>
                <StatusBadge variant="warning">{translate(`${key}.strategyReviewHandoff.blocked`)}</StatusBadge>
                <p className="text-sm">{translate(`${key}.strategyReviewHandoff.reason`)}: <code>{submission.strategyReviewHandoff.reason}</code></p>
                <p className="text-sm">{translate(`${key}.strategyReviewHandoff.nextAction.${submission.strategyReviewHandoff.nextAction}`)}</p>
                <p className="text-sm text-muted-foreground">{translate(`${key}.strategyReviewHandoff.noResume`)}</p>
                {submission.workflow ? (
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${encodeURIComponent(submission.workflow.id)}`}>
                      {translate(`${key}.strategyReviewHandoff.inspectWorkflow`)}
                    </Link>
                  </Button>
                ) : null}
                <JsonDisplay data={submission.strategyReviewHandoff} title={translate(`${key}.strategyReviewHandoff.title`)} />
              </div>
            ) : null}
            {submission.strategyPairContinuation ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.strategyPair.title`)}</h3>
                <StatusBadge variant={submission.strategyPairContinuation.status === 'accepted' ? 'success' : 'warning'}>
                  {translate(`${key}.strategyPair.${submission.strategyPairContinuation.status}`)}
                </StatusBadge>
                {submission.strategyPairContinuation.status === 'partial' ? <p className="text-sm">{translate(`${key}.strategyPair.followUp`)}</p> : null}
                {submission.strategyPairContinuation.status === 'accepted' ? (
                  <p className="text-sm">{translate(`${key}.strategyPair.planning.${submission.strategyPairContinuation.planningReadiness.status}`)}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.strategyPair.noExecution`)}</p>
                <JsonDisplay data={submission.strategyPairContinuation} title={translate(`${key}.strategyPair.title`)} />
              </div>
            ) : null}
            {submission.planningExecution ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.planningExecution.title`)}</h3>
                <p className="text-sm">{translate(`${key}.planningExecution.${submission.planningExecution.status}`)}</p>
                <p className="text-sm text-muted-foreground">{translate(`${key}.planningExecution.noApproval`)}</p>
                <JsonDisplay data={submission.planningExecution} title={translate(`${key}.planningExecution.title`)} />
              </div>
            ) : null}
            {submission.planningReviewHandoff?.status === 'blocked' ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.planningReviewHandoff.title`)}</h3>
                <StatusBadge variant="warning">{translate(`${key}.planningReviewHandoff.blocked`)}</StatusBadge>
                <p className="text-sm">{translate(`${key}.planningReviewHandoff.reason`)}: <code>{submission.planningReviewHandoff.reason}</code></p>
                <p className="text-sm">{translate(`${key}.planningReviewHandoff.nextAction.${submission.planningReviewHandoff.nextAction}`)}</p>
                <p className="text-sm text-muted-foreground">{translate(`${key}.planningReviewHandoff.noResume`)}</p>
                {submission.workflow ? (
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${encodeURIComponent(submission.workflow.id)}`}>
                      {translate(`${key}.planningReviewHandoff.inspectWorkflow`)}
                    </Link>
                  </Button>
                ) : null}
                <JsonDisplay data={submission.planningReviewHandoff} title={translate(`${key}.planningReviewHandoff.title`)} />
              </div>
            ) : null}
            {submission.postInstruction ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.postInstruction.title`)}</h3>
                <p className="text-sm">{translate(`${key}.postInstruction.${submission.postInstruction.status}`)}</p>
                {submission.postInstruction.status === 'ready' ? (
                  <p className="text-sm">{translate(`${key}.postInstruction.selectedTopic`)}: {submission.postInstruction.selectedTopicId}</p>
                ) : <p className="text-sm text-muted-foreground">{submission.postInstruction.reason}</p>}
                <p className="text-sm text-muted-foreground">{translate(`${key}.postInstruction.noPost`)}</p>
                <JsonDisplay data={submission.postInstruction} title={translate(`${key}.postInstruction.title`)} />
              </div>
            ) : null}
            {submission.postExecution ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.postExecution.title`)}</h3>
                <p className="text-sm">{translate(`${key}.postExecution.${submission.postExecution.status}`)}</p>
                {submission.postExecution.status === 'completed' || submission.postExecution.status === 'paused_budget' ? (
                  <p className="text-sm">{translate(`${key}.postExecution.${submission.postExecution.readyForReview ? 'readyForReview' : 'notReadyForReview'}`)}</p>
                ) : 'reason' in submission.postExecution ? <p className="text-sm text-muted-foreground">{submission.postExecution.reason}</p> : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.postExecution.noApproval`)}</p>
                <JsonDisplay data={submission.postExecution} title={translate(`${key}.postExecution.title`)} />
              </div>
            ) : null}
            {submission.postReviewHandoff ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.postReviewHandoff.title`)}</h3>
                <StatusBadge variant={submission.postReviewHandoff.status === 'blocked' ? 'warning' : 'neutral'}>
                  {translate(`${key}.postReviewHandoff.${submission.postReviewHandoff.status}`)}
                </StatusBadge>
                {submission.postReviewHandoff.status === 'blocked' ? (
                  <>
                    <p className="text-sm"><code>{submission.postReviewHandoff.reason}</code></p>
                    <p className="text-sm">{translate(`${key}.postReviewHandoff.nextAction.${submission.postReviewHandoff.nextAction}`)}</p>
                  </>
                ) : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.postReviewHandoff.noResume`)}</p>
                {submission.workflow ? (
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${submission.postReviewHandoff.status === 'invited' ? submission.postReviewHandoff.invitation.workflowInstanceId : submission.workflow.id}`}>
                      {translate(`${key}.postReviewHandoff.inspectWorkflow`)}
                    </Link>
                  </Button>
                ) : null}
                <JsonDisplay data={submission.postReviewHandoff} title={translate(`${key}.postReviewHandoff.title`)} />
              </div>
            ) : null}
            {submission.postRevision ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.postRevision.title`)}</h3>
                <p className="text-sm">{translate(`${key}.postRevision.${submission.postRevision.status}`)}</p>
                <p className="text-sm font-medium">{translate(`${key}.postRevision.savedCorrection`)}</p>
                <p className="whitespace-pre-wrap text-sm">{submission.original.postReviewResponse?.body ?? submission.original.text}</p>
                {submission.postRevisionHandoff ? (
                  <>
                    <StatusBadge variant={submission.postRevisionHandoff.status === 'blocked' ? 'warning' : 'neutral'}>
                      {translate(`${key}.postRevision.${submission.postRevisionHandoff.status}`)}
                    </StatusBadge>
                    {submission.postRevisionHandoff.status === 'blocked' ? (
                      <>
                        <p className="text-sm"><code>{submission.postRevisionHandoff.reason}</code></p>
                        <p className="text-sm">{translate(`${key}.postRevision.nextAction.${submission.postRevisionHandoff.nextAction}`)}</p>
                      </>
                    ) : null}
                  </>
                ) : 'reason' in submission.postRevision ? <p className="text-sm text-muted-foreground">{submission.postRevision.reason}</p> : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.postRevision.noApprovalOrResume`)}</p>
                {submission.workflow ? (
                  <Button type="button" asChild variant="outline">
                    <Link href={`/backend/instances/${submission.postRevisionHandoff?.status === 'invited' ? submission.postRevisionHandoff.invitation.workflowInstanceId : submission.workflow.id}`}>
                      {translate(`${key}.postRevision.inspectWorkflow`)}
                    </Link>
                  </Button>
                ) : null}
                <JsonDisplay data={submission.postRevisionHandoff ?? submission.postRevision} title={translate(`${key}.postRevision.title`)} />
              </div>
            ) : null}
            {submission.publicationPreparation ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{translate(`${key}.publicationPreparation.title`)}</h3>
                <p className="text-sm">{translate(`${key}.publicationPreparation.${submission.publicationPreparation.status}`)}</p>
                {submission.publicationPreparation.status === 'not_ready' ? (
                  <p className="text-sm text-muted-foreground">{submission.publicationPreparation.reason}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">{translate(`${key}.publicationPreparation.noSend`)}</p>
                <JsonDisplay data={submission.publicationPreparation} title={translate(`${key}.publicationPreparation.title`)} />
              </div>
            ) : null}
            {submission.tasks.map((task) => (
              <div key={task.id} className="flex flex-wrap items-center gap-2">
                <Button type="button" asChild variant="outline">
                  <Link href={buildWorkInboxItemHref(task.id)}>{translate(`${key}.openTask`, 'Open employee task')}</Link>
                </Button>
                <span className="text-sm text-muted-foreground">{task.status} · {task.claimedBy ?? task.assignedTo ?? task.assignedToRoles.join(', ')}</span>
              </div>
            ))}
            <CollapsibleSection title={translate(`${key}.evidence`, 'Stored input and interpretation')} defaultCollapsed>
              <div className="grid grid-cols-1 gap-4 pt-4 xl:grid-cols-2">
                <JsonDisplay data={submission.original} title={translate('agencyOperations.cases.detail.run.input')} />
                <JsonDisplay data={submission.interpretation ?? submission.disposition} title={translate('agencyOperations.cases.detail.run.output')} />
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>
      ))}
    </section>
  )
}
