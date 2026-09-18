'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Textarea } from '@open-mercato/ui/primitives/textarea'

export function ClientMessageForm<T>({ endpoint, formId, reply = false, available = true, onSaved }: {
  endpoint: string
  formId: string
  reply?: boolean
  available?: boolean
  onSaved: (item: T) => void
}) {
  const t = useT()
  const [ready, setReady] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const [retrying, setRetrying] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const fieldId = `${formId}-text`
  const initialValues = React.useMemo(() => ({ [fieldId]: '' }), [fieldId])
  const attempt = React.useRef<{ eventId: string; text: string } | null>(null)
  React.useEffect(() => { setReady(true) }, [])
  const fields = React.useMemo<CrudField[]>(() => [{
    id: fieldId, type: 'custom', required: true,
    label: t(reply ? 'agency.conversation.reply' : 'agency.conversation.message'),
    component: ({ id, value, setValue, disabled }) => (
      <Textarea id={id} name="text" value={typeof value === 'string' ? value : ''}
        aria-label={t(reply ? 'agency.conversation.reply' : 'agency.conversation.message')}
        disabled={disabled || retrying || pending} required maxLength={20000}
        onChange={(event) => setValue(event.target.value)} />
    ),
  }], [fieldId, reply, retrying, pending, t])

  async function submit(values: Record<string, unknown>) {
    if (!attempt.current) {
      const text = values[fieldId]
      if (typeof text !== 'string' || !text.trim() || text.length > 20000) {
        throw createCrudFormError(t('agency.conversation.invalid'))
      }
      attempt.current = { eventId: crypto.randomUUID(), text }
    }
    let result
    setPending(true)
    try {
      result = await apiCall<{ item: T; replayed: boolean }>(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current),
      })
    } catch {
      setRetrying(true)
      throw createCrudFormError(t('agency.conversation.saveError'))
    } finally {
      setPending(false)
    }
    if (!result.ok || !result.result?.item) {
      setRetrying(true)
      throw createCrudFormError(t(result.status === 409 ? 'agency.conversation.waitEnded' : 'agency.conversation.saveError'))
    }
    attempt.current = null
    setRetrying(false)
    setRevision((value) => value + 1)
    onSaved(result.result.item)
  }

  return (
    <div className="space-y-2">
      {retrying ? <p className="text-sm text-muted-foreground">{t('agency.conversation.retryHint')}</p> : null}
      <CrudForm key={revision} fields={fields} initialValues={initialValues} onSubmit={submit}
        formId={formId} embedded isLoading={!ready || !available} disableInitialFocus
        submitLabel={t(reply ? 'agency.conversation.sendReply' : 'agency.conversation.sendMessage')} />
    </div>
  )
}
