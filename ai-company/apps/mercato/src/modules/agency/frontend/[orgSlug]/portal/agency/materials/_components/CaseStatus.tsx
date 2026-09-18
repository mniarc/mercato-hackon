'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage, formatAttachmentFileSize } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import type { ClientCaseItem } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'

export function CaseStatus({ caseId, showMaterial = false }: { caseId: string; showMaterial?: boolean }) {
  const t = useT()
  const [agencyCase, setAgencyCase] = React.useState<ClientCaseItem | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<'notFound' | 'loadError' | null>(null)
  const [refresh, setRefresh] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setAgencyCase(null)
    apiCall<ClientCaseItem>(`/api/agency/portal/cases/${encodeURIComponent(caseId)}`)
      .then((response) => {
        if (cancelled) return
        if (response.ok && response.result) setAgencyCase(response.result)
        else setError(response.status === 404 ? 'notFound' : 'loadError')
      })
      .catch(() => { if (!cancelled) setError('loadError') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [caseId, refresh])

  return (
    <section className="space-y-3" aria-label={t('agency.materials.currentStatus')}>
      {loading ? <LoadingMessage label={t('agency.materials.statusLoading')} /> : null}
      {error ? <ErrorMessage label={t(`agency.materials.${error}`)} /> : null}
      {agencyCase ? (
        <div className="space-y-3">
          {showMaterial ? (
            <dl className="space-y-3">
              <div><dt className="text-sm text-muted-foreground">{t('agency.materials.caseTitle')}</dt><dd className="font-medium">{agencyCase.title}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('agency.materials.caseId')}</dt><dd className="break-all text-sm">{agencyCase.caseId}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('agency.materials.file')}</dt><dd>{agencyCase.materialFileName} ({formatAttachmentFileSize(agencyCase.materialFileSize)})</dd></div>
            </dl>
          ) : null}
          <p role="status">{t(`agency.materials.status.${agencyCase.workflow?.status ?? 'UNAVAILABLE'}`)}</p>
        </div>
      ) : null}
      <Button type="button" variant="outline" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
        {t('agency.materials.refreshStatus')}
      </Button>
    </section>
  )
}
