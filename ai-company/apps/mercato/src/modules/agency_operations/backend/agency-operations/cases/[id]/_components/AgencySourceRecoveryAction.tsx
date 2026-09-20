'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'

const key = 'agencyOperations.cases.process.sourceRecovery'

export function AgencySourceRecoveryAction({ caseId, workflowInstanceId, onResumed }: {
  caseId: string; workflowInstanceId: string; onResumed: () => void
}) {
  const translate = useT()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState(false)
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `agency-source-recovery:${caseId}`,
    blockedMessage: translate(`${key}.failed`) })

  async function resume() {
    setPending(true)
    setError(false)
    try {
      await runMutation({
        operation: async () => {
          await readApiResultOrThrow(`/api/agency_operations/cases/${encodeURIComponent(caseId)}/resume-source-analysis`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflowInstanceId }),
          }, { errorMessage: translate(`${key}.failed`) })
          onResumed()
        },
        context: { entityId: 'agency_operations:agency_case', recordId: caseId, workflowInstanceId, retryLastMutation },
        mutationPayload: { workflowInstanceId },
      })
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">{translate(`${key}.ready`)}</p>
    <Button type="button" variant="outline" disabled={pending} onClick={() => void resume()}>
      {translate(`${key}.${pending ? 'resuming' : 'resume'}`)}
    </Button>
    {error ? <ErrorMessage label={translate(`${key}.failed`)} /> : null}
  </div>
}
