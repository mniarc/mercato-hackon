'use client'

import * as React from 'react'
import Link from 'next/link'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { FormHeader } from '@open-mercato/ui/backend/forms'
import {
  ErrorMessage,
  LoadingMessage,
  RecordNotFoundState,
  formatAttachmentFileSize,
} from '@open-mercato/ui/backend/detail'
import { JsonDisplay } from '@open-mercato/ui/backend/JsonDisplay'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { AgencyCaseEscalation } from './AgencyCaseEscalation'
import { AgencyCaseProcess } from './AgencyCaseProcess'
import {
  loadAgencyCaseDetail,
  type AgencyCaseDetailView,
} from '../../_lib/caseViewModel'

const CASES_PATH = '/backend/agency-operations/cases'

function statusVariant(status: string | null): StatusBadgeVariant {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'FAILED':
      return 'error'
    case 'RUNNING':
    case 'WAITING_FOR_ACTIVITIES':
      return 'info'
    case 'PAUSED':
    case 'COMPENSATING':
      return 'warning'
    default:
      return 'neutral'
  }
}

function statusKey(status: string | null): string {
  switch (status) {
    case 'COMPLETED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    case 'RUNNING':
      return 'running'
    case 'PAUSED':
      return 'paused'
    case 'CANCELLED':
      return 'cancelled'
    case 'COMPENSATING':
      return 'compensating'
    case 'COMPENSATED':
      return 'compensated'
    case 'WAITING_FOR_ACTIVITIES':
      return 'waitingForActivities'
    default:
      return status ? 'unknown' : 'notStarted'
  }
}

function formatDateTime(value: string | null, locale: string, emptyLabel: string): string {
  if (!value) return emptyLabel
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? emptyLabel : date.toLocaleString(locale || undefined)
}

export function AgencyCaseDetail({ caseId }: { caseId?: string }) {
  const translate = useT()
  const locale = useLocale()
  const scopeVersion = useOrganizationScopeVersion()
  const [detail, setDetail] = React.useState<AgencyCaseDetailView | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false

    async function loadDetail() {
      setIsLoading(true)
      setNotFound(false)
      setError(null)
      try {
        if (!caseId) {
          setNotFound(true)
          return
        }
        const result = await loadAgencyCaseDetail(caseId)
        if (cancelled) return
        if (!result) {
          setNotFound(true)
          return
        }
        setDetail(result)
      } catch {
        if (!cancelled) setError(translate('agencyOperations.cases.detail.loadError'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadDetail()
    return () => {
      cancelled = true
    }
  }, [caseId, scopeVersion, translate, refreshVersion])

  if (isLoading) {
    return <LoadingMessage label={translate('agencyOperations.cases.detail.loading')} />
  }

  if (notFound) {
    return (
      <RecordNotFoundState
        label={translate('agencyOperations.cases.detail.notFound')}
        backHref={CASES_PATH}
        backLabel={translate('agencyOperations.cases.detail.backToList')}
      />
    )
  }

  if (error || !detail) {
    return <ErrorMessage label={error ?? translate('agencyOperations.cases.detail.loadError')} />
  }

  const { agencyCase, materialUrl, workflow } = detail
  const emptyLabel = translate('agencyOperations.cases.common.notAvailable')
  const workflowStatus = workflow?.status ?? null

  return (
    <div className="space-y-6">
      <FormHeader
        mode="detail"
        backHref={CASES_PATH}
        backLabel={translate('agencyOperations.cases.detail.backToList')}
        title={agencyCase.title}
        entityTypeLabel={translate('agencyOperations.cases.detail.entityLabel')}
        statusBadge={(
          <StatusBadge variant={statusVariant(workflowStatus)} dot>
            {translate(`agencyOperations.cases.status.${statusKey(workflowStatus)}`)}
          </StatusBadge>
        )}
      />

      <AgencyCaseEscalation key={`${agencyCase.id}:${scopeVersion}`} caseId={agencyCase.id} updatedAt={agencyCase.updatedAt} />

      <AgencyCaseProcess key={`process:${agencyCase.id}:${scopeVersion}`} caseId={agencyCase.id} />

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {translate('agencyOperations.cases.detail.sections.case')}
        </h2>
        <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.clientId')}
            </dt>
            <dd className="mt-1 break-all text-sm text-foreground">{agencyCase.customerEntityId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.submittedBy')}
            </dt>
            <dd className="mt-1 break-all text-sm text-foreground">
              {agencyCase.submittedByCustomerUserId}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.worker')}
            </dt>
            <dd className="mt-1 break-all text-sm text-foreground">{agencyCase.agentWorkerId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.createdAt')}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {formatDateTime(agencyCase.createdAt, locale, emptyLabel)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">
          {translate('agencyOperations.cases.detail.sections.material')}
        </h2>
        <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.fileName')}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {agencyCase.materialFileName ?? emptyLabel}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.mimeType')}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {agencyCase.materialMimeType ?? emptyLabel}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {translate('agencyOperations.cases.detail.fields.fileSize')}
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {typeof agencyCase.materialFileSize === 'number'
                ? formatAttachmentFileSize(agencyCase.materialFileSize)
                : emptyLabel}
            </dd>
          </div>
        </dl>
        {materialUrl ? (
          <Link className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href={materialUrl}>
            {translate('agencyOperations.cases.detail.material.open')}
          </Link>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {translate('agencyOperations.cases.detail.sections.run')}
            </h2>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {workflow?.id ?? emptyLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setRefreshVersion((version) => version + 1)}>
              {translate('agencyOperations.cases.detail.workflow.refresh')}
            </Button>
            {workflow ? (
              <Button type="button" asChild variant="outline">
                <Link href={`/backend/instances/${encodeURIComponent(workflow.id)}`}>
                  {translate('agencyOperations.cases.detail.workflow.open')}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {workflow?.research ? (
        <section className="space-y-4 rounded-lg border bg-card p-6">
          <SectionHeader title={translate('agencyOperations.cases.detail.sections.research')} />
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {translate('agencyOperations.cases.detail.research.run')}
              </dt>
              <dd className="mt-1 break-all text-sm">{workflow.research.researchRunId ?? emptyLabel}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {translate('agencyOperations.cases.detail.research.documents')}
              </dt>
              <dd className="mt-1 break-all text-sm">
                {workflow.research.documentVersionIds.length > 0
                  ? workflow.research.documentVersionIds.map((id) => <div key={id}>{id}</div>)
                  : emptyLabel}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {translate('agencyOperations.cases.detail.research.referencesHint')}
          </p>
          {workflow.research.agentRunIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {workflow.research.agentRunIds.map((id, index) => (
                <Button key={id} type="button" asChild variant="outline">
                  <Link href={`/backend/traces/${encodeURIComponent(id)}`}>
                    {translate('agencyOperations.cases.detail.research.agentRun')} {index + 1}
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {workflow ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <JsonDisplay
            data={workflow.input}
            title={translate('agencyOperations.cases.detail.run.input')}
          />
          <JsonDisplay
            data={workflow.output}
            title={translate('agencyOperations.cases.detail.run.output')}
          />
          {workflow.error !== null ? (
            <JsonDisplay
              data={workflow.error}
              title={translate('agencyOperations.cases.detail.run.error')}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
