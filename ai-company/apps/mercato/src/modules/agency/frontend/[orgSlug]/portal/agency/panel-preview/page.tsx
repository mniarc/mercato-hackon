"use client"

import { PANEL_CSS } from '../../../../../theme/panelPreviewStyles'
import * as React from 'react'
import Link from 'next/link'

type Props = { params: { orgSlug: string } }

/**
 * PREVIEW ONLY — shows how the client panel would look with active tasks
 * (Studio Komunikacji design). The real dashboard reflects the live state.
 */
export default function AgencyPanelPreviewPage({ params }: Props) {
  const base = `/${params.orgSlug}/portal/agency`
  const steps = [
    { n: '✓', l: 'Zamówienie', s: 'done' },
    { n: '✓', l: 'Research', s: 'done' },
    { n: '3', l: 'Brief', s: 'now' },
    { n: '4', l: 'Strategia i ton', s: 'todo' },
    { n: '5', l: 'Plan treści', s: 'todo' },
    { n: '6', l: 'Post', s: 'todo' },
    { n: '7', l: 'Publikacja', s: 'todo' },
    { n: '8', l: 'Pakiet', s: 'todo' },
  ]
  const docs = [
    { t: 'Brief komunikacji', s: 'zaktualizowany przed chwilą', pill: 'do akceptacji', wait: true },
    { t: 'Audyt komunikacji', s: 'oferta, odbiorcy, ton głosu', pill: 'gotowe' },
    { t: 'Analiza konkurencji', s: '3 firmy z kategorii', pill: 'gotowe' },
  ]
  return (
    <div className="ag-panel">
      <style>{PANEL_CSS}</style>

      <div className="ag-preview-note">Podgląd — tak Panel wygląda, gdy w sprawie są aktywne zadania. Prawdziwy panel na pulpicie pokazuje bieżący stan.</div>

      <section className="ag-block">
        <div className="ag-block-h"><h3>Postęp</h3><span className="ag-meta">3 / 8 etapów</span></div>
        <div className="ag-steps">
          {steps.map((st, i) => (
            <div key={i} className={`ag-stile ${st.s}`}>
              <span className="ag-sn">{st.n}</span>
              <span className="ag-sl">{st.l}</span>
              {st.s === 'now' ? <span className="ag-snow">teraz</span> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="ag-grid">
        <div className="ag-col">
          <Link href={`${base}/tasks-demo`} className="ag-attn">
            <span className="ag-attn-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            </span>
            <span className="ag-attn-tx"><b>Brief komunikacji czeka na Ciebie</b><small>Wersja 1.1 · przejrzyj, dodaj uwagi lub zaakceptuj</small></span>
            <span className="ag-attn-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6"/></svg></span>
          </Link>

          <section className="ag-block">
            <div className="ag-block-h"><h3>Ostatnie dokumenty</h3><Link className="ag-link" href={`${base}/tasks-demo`}>Wszystkie</Link></div>
            <div className="ag-rows">
              {docs.map((d, i) => (
                <Link key={i} href={`${base}/tasks-demo`} className="ag-row">
                  <span className="ag-row-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>
                  <span className="ag-row-tx"><b>{d.t}</b><small>{d.s}</small></span>
                  <span className={`ag-pill ${d.wait ? 'wait' : ''}`}>{d.pill}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="ag-block">
          <div className="ag-block-h"><h3>Twoje zamówienie</h3></div>
          <div className="ag-kv">
            <div><span>Pakiet</span><b>START komunikacji</b></div>
            <div><span>Numer</span><b>#OM‑1042</b></div>
            <div><span>Status</span><b>W realizacji</b></div>
            <div><span>Plan publikacji</span><b>12 tematów · 30 dni</b></div>
            <div><span>Do akceptacji</span><b>1</b></div>
          </div>
          <Link href={base} className="ag-btn">Zobacz ofertę i zamówienie</Link>
        </section>
      </div>
    </div>
  )
}
