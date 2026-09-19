"use client"

import { PANEL_CSS } from '../../../theme/panelStyles'
import * as React from 'react'
import Link from 'next/link'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'

type Ctx = { orgSlug?: string }

type CaseItem = {
  caseId: string
  title: string
  createdAt: string
  updatedAt: string | null
  workflow: { status: string } | null
}

const STEP_LABELS = ['Zamówienie', 'Research', 'Brief', 'Strategia i ton', 'Plan treści', 'Post', 'Publikacja', 'Pakiet']

// Which step the case is currently at, from the real native workflow status.
// A freshly placed / paid order sits at step 1 (Zamówienie), before research.
function stageIndex(status?: string | null): number {
  if (!status || status === 'PAUSED') return 0
  if (status === 'COMPLETED' || status === 'COMPENSATED') return 7
  if (status === 'FAILED' || status === 'CANCELLED') return 0
  return 1 // RUNNING / WAITING_FOR_ACTIVITIES / FORKED / COMPENSATING → research in progress
}

function statusPill(status?: string | null): { label: string; tone: 'run' | 'done' | 'stop' | 'hold' } {
  if (!status) return { label: 'Złożone', tone: 'hold' }
  if (status === 'PAUSED') return { label: 'Opłacone — czeka na realizację', tone: 'hold' }
  if (status === 'COMPLETED' || status === 'COMPENSATED') return { label: 'Zakończone', tone: 'done' }
  if (status === 'FAILED' || status === 'CANCELLED') return { label: 'Zatrzymane', tone: 'stop' }
  return { label: 'W realizacji', tone: 'run' }
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' }
}

export default function AgencyPortalPanel({ context }: InjectionWidgetComponentProps<Ctx>) {
  const org = context?.orgSlug ?? ''
  const base = `/${org}/portal/agency`
  const [cases, setCases] = React.useState<CaseItem[] | null>(null)
  const [offer, setOffer] = React.useState<{ name?: string; amount?: number; currency?: string } | null>(null)

  React.useEffect(() => {
    let live = true
    fetch('/api/agency/portal/cases?pageSize=20', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (live) setCases(Array.isArray(d?.items) ? d.items : []) })
      .catch(() => { if (live) setCases([]) })
    fetch('/api/agency/portal/purchases', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((o) => { if (live) setOffer({ name: o?.name, amount: o?.amount, currency: o?.currency }) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const loading = cases === null
  const list = cases ?? []
  const latest = list[0] ?? null
  const active = list.filter((c) => c.workflow && c.workflow.status !== 'COMPLETED' && c.workflow.status !== 'CANCELLED')
  const idx = latest ? stageIndex(latest.workflow?.status) : 0

  return (
    <div className="ag-panel">
      <style>{PANEL_CSS}</style>

      {loading ? (
        <div className="ag-block"><div className="ag-skel" /><div className="ag-skel short" /></div>
      ) : list.length === 0 ? (
        <div className="ag-empty">
          <b>Nie masz jeszcze aktywnej sprawy</b>
          <p>Złóż zamówienie na START komunikacji — zespół przygotuje audyt, strategię i pierwszy post do Twojej akceptacji.</p>
          <Link href={base} className="ag-btn ag-btn-primary">Zobacz ofertę</Link>
        </div>
      ) : (
        <>
          <section className="ag-block">
            <div className="ag-block-h">
              <div><h3>{latest?.title ?? 'Twoja realizacja'}</h3>{latest ? <div className="ag-sub">złożone {fmtDate(latest.createdAt)}</div> : null}</div>
              <span className="ag-meta">{Math.min(idx + 1, 8)} / 8 etapów</span>
            </div>
            <div className="ag-steps">
              {STEP_LABELS.map((label, i) => {
                const s = i < idx ? 'done' : i === idx ? 'now' : 'todo'
                return (
                  <div key={i} className={`ag-stile ${s}`}>
                    <span className="ag-sn">{s === 'done' ? '✓' : String(i + 1)}</span>
                    <span className="ag-sl">{label}</span>
                    {s === 'now' ? <span className="ag-snow">teraz</span> : null}
                  </div>
                )
              })}
            </div>
          </section>

          <div className="ag-grid">
            <section className="ag-block">
              <div className="ag-block-h"><h3>Twoje sprawy</h3><span className="ag-meta">{list.length}</span></div>
              <div className="ag-rows">
                {list.slice(0, 6).map((c) => {
                  const p = statusPill(c.workflow?.status)
                  return (
                    <Link key={c.caseId} href={`${base}/cases`} className="ag-row">
                      <span className="ag-row-tx"><b>{c.title}</b><small>złożone {fmtDate(c.createdAt)}</small></span>
                      <span className={`ag-pill t-${p.tone}`}>{p.label}</span>
                    </Link>
                  )
                })}
              </div>
            </section>

            <section className="ag-block">
              <div className="ag-block-h"><h3>Twój pakiet</h3></div>
              <div className="ag-kv">
                <div><span>Pakiet</span><b>{offer?.name ?? 'START komunikacji'}</b></div>
                <div><span>Kwota</span><b>{offer?.amount ? `${offer.amount} ${offer.currency ?? 'PLN'}` : '2 500 PLN'}</b></div>
                <div><span>Wszystkie sprawy</span><b>{list.length}</b></div>
                <div><span>W toku</span><b>{active.length}</b></div>
              </div>
              <Link href={base} className="ag-btn">Zamów kolejną realizację</Link>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
