'use client'

import * as React from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { hasAllFeatures } from '@open-mercato/shared/security/features'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'

const REQUIRED_FEATURES = ['agency_operations.cases.escalate', 'agency_operations.cases.view', 'customers.companies.view']

type EscalationResult = { caseId: string; workflowInstanceId: string; deduplicated: boolean }
type EscalationValues = { reason: string; evidence: string }

export function AgencyCaseEscalation({ caseId, updatedAt }: { caseId: string; updatedAt: string | null }) {
  const translate = useT()
  const [allowed, setAllowed] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<EscalationResult | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function checkAccess() {
      try {
        const call = await apiCall<{ granted?: string[] }>('/api/auth/feature-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ features: REQUIRED_FEATURES }),
        })
        if (!cancelled) setAllowed(call.ok && hasAllFeatures(call.result?.granted, REQUIRED_FEATURES))
      } catch {
        if (!cancelled) setAllowed(false)
      }
    }
    void checkAccess()
    return () => { cancelled = true }
  }, [])

  const schema = React.useMemo(() => z.object({
    reason: z.string().trim().min(1, translate('agencyOperations.cases.escalation.reasonRequired')).max(2000, translate('agencyOperations.cases.escalation.reasonTooLong')),
    evidence: z.string().trim().max(4000, translate('agencyOperations.cases.escalation.evidenceTooLong')),
  }), [translate])
  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'reason', required: true, maxLength: 2000 },
    { id: 'evidence', required: false, maxLength: 4000 },
  ].map<CrudField>(({ id, required, maxLength }) => {
    const label = translate(`agencyOperations.cases.escalation.${id}`)
    return {
      id, type: 'custom', label, required,
      component: ({ id: inputId, value, setValue, disabled, error, autoFocus }) => (
        <Textarea
          id={inputId}
          name={id}
          aria-label={label}
          aria-invalid={Boolean(error)}
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => setValue(event.target.value)}
        />
      ),
    }
  }), [translate])
  const initialValues = React.useMemo(() => ({ id: caseId, updatedAt, reason: '', evidence: '' }), [caseId, updatedAt])

  async function submit(values: EscalationValues) {
    setSubmitting(true)
    try {
      const attention = await readApiResultOrThrow<EscalationResult>(
        `/api/agency_operations/cases/${encodeURIComponent(caseId)}/escalate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: values.reason, evidence: values.evidence }),
        },
        { errorMessage: translate('agencyOperations.cases.escalation.error') },
      )
      setResult(attention)
      setOpen(false)
      flash(translate(attention.deduplicated ? 'agencyOperations.cases.escalation.reused' : 'agencyOperations.cases.escalation.success'), 'success')
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowed) return null

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {translate('agencyOperations.cases.escalation.action')}
      </Button>
      {result ? (
        <Alert status="success">
          <AlertDescription>
            <p>{translate(result.deduplicated ? 'agencyOperations.cases.escalation.reused' : 'agencyOperations.cases.escalation.success')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" asChild variant="outline" size="sm">
                <Link href="/backend/work-inbox">{translate('agencyOperations.cases.escalation.inbox')}</Link>
              </Button>
              <Button type="button" asChild variant="outline" size="sm">
                <Link href={`/backend/instances/${encodeURIComponent(result.workflowInstanceId)}`}>
                  {translate('agencyOperations.cases.escalation.workflow')}
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) setOpen(nextOpen) }}>
        <DialogContent
          className="sm:max-w-2xl"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!submitting) event.currentTarget.querySelector('form')?.requestSubmit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{translate('agencyOperations.cases.escalation.action')}</DialogTitle>
            <DialogDescription>{translate('agencyOperations.cases.escalation.description')}</DialogDescription>
          </DialogHeader>
          <CrudForm
            embedded
            schema={schema}
            fields={fields}
            entityId="agency_operations:agency_case"
            initialValues={initialValues}
            submitLabel={translate('agencyOperations.cases.escalation.submit')}
            onSubmit={submit}
            extraActions={(
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
                {translate('agencyOperations.cases.escalation.cancel')}
              </Button>
            )}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
