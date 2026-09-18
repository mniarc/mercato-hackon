'use client'

import * as React from 'react'
import Link from 'next/link'
import { z } from 'zod'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { Button } from '@open-mercato/ui/primitives/button'

const attentionContextSchema = z.object({
  attentionKind: z.literal('agency_case'),
  caseId: z.uuid(), customerEntityId: z.uuid(), title: z.string(),
  reason: z.string(), evidence: z.string(), materialFileName: z.string(),
  sourceWorkflowInstanceId: z.uuid().nullable(),
})

export default function AgencyAttentionContext({ context }: InjectionWidgetComponentProps) {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const instanceId = z.object({ workflowInstanceId: z.uuid() }).safeParse(context)
  const workflowInstanceId = instanceId.success ? instanceId.data.workflowInstanceId : null
  const [data, setData] = React.useState<z.infer<typeof attentionContextSchema> | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setData(null)
    setError(false)
    if (!workflowInstanceId) return
    setLoading(true)
    apiCall<{ data?: { context?: unknown } }>(`/api/workflows/instances/${encodeURIComponent(workflowInstanceId)}`)
      .then((result) => {
        if (cancelled) return
        if (!result.ok) { setError(true); return }
        const parsed = attentionContextSchema.safeParse(result.result?.data?.context)
        setData(parsed.success ? parsed.data : null)
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workflowInstanceId, scopeVersion])

  if (loading) return <LoadingMessage label={t('agencyOperations.cases.detail.loading')} />
  if (error) return <ErrorMessage label={t('agencyOperations.cases.detail.loadError')} />
  if (!data) return null
  return <section className="space-y-4 rounded-lg border border-border p-4">
    <SectionHeader title={data.title} />
    <p className="whitespace-pre-wrap">{data.reason}</p>
    {data.evidence ? <p className="whitespace-pre-wrap text-muted-foreground">{data.evidence}</p> : null}
    <p className="text-sm">{data.materialFileName}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" asChild><Link href={`/backend/agency-operations/cases/${data.caseId}`}>{t('agencyOperations.cases.detail.entityLabel')}</Link></Button>
      <Button type="button" variant="outline" size="sm" asChild><Link href={`/backend/customers/companies/${data.customerEntityId}`}>{t('agencyOperations.cases.list.columns.client')}</Link></Button>
      <Button type="button" variant="outline" size="sm" asChild><a href={`/api/agency_operations/cases/${data.caseId}/material`} target="_blank" rel="noreferrer">{t('agencyOperations.cases.detail.material.open')}</a></Button>
      {data.sourceWorkflowInstanceId ? <Button type="button" variant="outline" size="sm" asChild><Link href={`/backend/instances/${data.sourceWorkflowInstanceId}`}>{t('agencyOperations.cases.detail.workflow.open')}</Link></Button> : null}
    </div>
  </section>
}
