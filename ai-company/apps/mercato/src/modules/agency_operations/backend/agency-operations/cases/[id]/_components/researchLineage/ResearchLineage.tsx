'use client'

import * as React from 'react'
import { z } from 'zod'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { JsonDisplay } from '@open-mercato/ui/backend/JsonDisplay'
import { Button } from '@open-mercato/ui/primitives/button'
import { outputIdByTemplate, templateIds } from '@/modules/agency_research/data/schemas/envelope'

const key = 'agencyOperations.cases.researchLineage'
const envelopeSchema = z.object({
  id: z.string().min(1), order_id: z.string(), template_id: z.string(), version: z.string(), status: z.string(),
  input_versions: z.unknown(), approval_records: z.unknown(),
}).passthrough()
export type ResearchLineageVersion = z.infer<typeof envelopeSchema>
const referenceSchema = z.object({ document_id: z.string(), version: z.string() })
const decisionSchema = z.object({ person: z.string(), at: z.string(), scope: z.string(), version: z.string() })

function templateFor(reference: string, caseId: string): string | null {
  const suffix = `@${caseId}`
  if (!reference.endsWith(suffix)) return null
  const name = reference.slice(0, -suffix.length)
  return templateIds.find((template) => template === name || outputIdByTemplate[template] === name) ?? null
}

/** Lazy staff navigation through persisted links. Never interprets history as current authorization. */
export function ResearchLineage({ caseId, initialVersion }: { caseId: string; initialVersion: ResearchLineageVersion }) {
  const t = useT()
  const [trail, setTrail] = React.useState<ResearchLineageVersion[]>([initialVersion])
  const current = trail[trail.length - 1]
  const [history, setHistory] = React.useState<ResearchLineageVersion[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const requestId = React.useRef(0)
  React.useEffect(() => () => { requestId.current += 1 }, [])

  const fetchHistory = async (template: string): Promise<ResearchLineageVersion[]> => {
    const response = await apiCall<unknown>(`/api/agency_research/document-versions?order_ref=${encodeURIComponent(caseId)}&template_id=${encodeURIComponent(template)}`)
    if (!response.ok) throw new Error(response.status === 403 ? 'forbidden' : 'unavailable')
    const parsed = z.object({ items: z.array(envelopeSchema) }).safeParse(response.result)
    if (!parsed.success || parsed.data.items.some((row) => row.order_id !== caseId || row.template_id !== template)) throw new Error('unavailable')
    return parsed.data.items
  }
  const fetchVersion = async (reference: ResearchLineageVersion): Promise<ResearchLineageVersion> => {
    const response = await apiCall<unknown>(`/api/agency_research/document-versions?id=${encodeURIComponent(reference.id)}`)
    if (!response.ok) throw new Error(response.status === 403 ? 'forbidden' : 'unavailable')
    const parsed = envelopeSchema.safeParse(response.result)
    if (!parsed.success || parsed.data.order_id !== caseId || parsed.data.id !== reference.id
      || parsed.data.template_id !== reference.template_id || parsed.data.version !== reference.version) throw new Error('unavailable')
    return parsed.data
  }
  const navigate = async (load: () => Promise<ResearchLineageVersion>) => {
    const id = ++requestId.current
    setBusy(true); setError(null)
    try {
      const next = await load()
      if (id !== requestId.current) return
      setTrail((previous) => [...previous, next]); setHistory(null)
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error && failure.message === 'forbidden' ? 'forbidden' : 'unavailable')
    } finally { if (id === requestId.current) setBusy(false) }
  }
  const showHistory = async () => {
    const id = ++requestId.current
    setBusy(true); setError(null)
    try {
      const rows = await fetchHistory(current.template_id)
      if (id === requestId.current) setHistory(rows)
    } catch (failure) {
      if (id === requestId.current) setError(failure instanceof Error && failure.message === 'forbidden' ? 'forbidden' : 'unavailable')
    } finally { if (id === requestId.current) setBusy(false) }
  }
  const back = () => {
    requestId.current += 1; setBusy(false); setError(null); setHistory(null)
    setTrail((previous) => previous.slice(0, -1))
  }
  const references = Array.isArray(current.input_versions) ? current.input_versions.map((raw) => referenceSchema.safeParse(raw)).flatMap((parsed) => parsed.success ? [parsed.data] : []) : []
  const decisions = Array.isArray(current.approval_records) ? current.approval_records.map((raw) => decisionSchema.safeParse(raw)).flatMap((parsed) => parsed.success ? [parsed.data] : []) : []

  return <section className="space-y-3" aria-label={t(`${key}.title`)}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{current.template_id} · {current.version} · {current.status}</span>
      {trail.length > 1 ? <Button type="button" variant="outline" onClick={back}>{t(`${key}.back`)}</Button> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void showHistory()}>{t(`${key}.history`)}</Button>
    </div>
    <p className="text-sm text-muted-foreground">{t(`${key}.historyHint`)}</p>
    <h4 className="font-medium">{t(`${key}.inputs`)}</h4>
    {references.length ? <ul className="space-y-1">{references.map((reference, index) => {
      const template = templateFor(reference.document_id, caseId)
      return <li key={`${reference.document_id}:${reference.version}:${index}`}>
        <Button type="button" variant="outline" disabled={busy || !template} onClick={() => void navigate(async () => {
          const versions = await fetchHistory(template!)
          const matches = versions.filter((row) => row.version === reference.version)
          if (matches.length !== 1) throw new Error('unavailable')
          return fetchVersion(matches[0])
        })}>{reference.document_id} · {reference.version}</Button>
        {!template ? <span className="ml-2 text-sm text-muted-foreground">{t(`${key}.unresolved`)}</span> : null}
      </li>
    })}</ul> : <p className="text-sm">{t(`${key}.noInputs`)}</p>}
    {busy ? <p role="status">{t(`${key}.loading`)}</p> : null}
    {error ? <p role="alert">{t(`${key}.${error}`)}</p> : null}
    {history ? <div className="space-y-1" aria-label={t(`${key}.history`)}>
      {history.map((row) => <div key={row.id}>
        <Button type="button" variant="outline" disabled={busy || row.id === current.id} onClick={() => void navigate(() => fetchVersion(row))}>{row.version} · {row.status}</Button>
      </div>)}
      {!history.length ? <p>{t(`${key}.unavailable`)}</p> : null}
    </div> : null}
    <h4 className="font-medium">{t(`${key}.decisions`)}</h4>
    {decisions.length ? <ul className="space-y-1 text-sm">{decisions.map((decision, index) => <li key={index}>
      {decision.scope} · {decision.version} · {decision.person} · {decision.at}
    </li>)}</ul> : <p className="text-sm">{t(`${key}.noDecisions`)}</p>}
    <JsonDisplay title={t('agencyOperations.cases.researchLedger.selectedVersion')} data={current} />
  </section>
}
