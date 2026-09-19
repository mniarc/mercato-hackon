"use client"

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

const PANEL_CSS = `
.ag-panel{display:flex;flex-direction:column;gap:18px}
.ag-preview-note{font-size:12.5px;color:var(--muted-foreground);background:color-mix(in srgb,var(--foreground) 5%,transparent);border:1px dashed var(--border);border-radius:12px;padding:11px 14px}
.ag-panel .ag-block{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(16px);border-radius:16px;padding:18px 20px}
.ag-panel .ag-block-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.ag-panel .ag-block-h h3{font-size:15px;font-weight:500;margin:0}
.ag-panel .ag-meta{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.ag-panel .ag-link{font-size:12.5px;color:var(--muted-foreground);text-decoration:none;border:1px solid var(--border);border-radius:8px;padding:5px 11px}
.ag-panel .ag-steps{display:grid;grid-template-columns:repeat(8,1fr);gap:9px}
.ag-panel .ag-stile{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 50%,transparent);border-radius:13px;padding:13px 11px;min-height:92px;display:flex;flex-direction:column;gap:9px;justify-content:space-between}
.ag-panel .ag-sn{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:12px;font-weight:500;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.ag-panel .ag-sl{font-size:11.5px;color:var(--muted-foreground);line-height:1.25}
.ag-panel .ag-stile.done .ag-sn{background:var(--foreground);color:var(--background)}
.ag-panel .ag-stile.done .ag-sl{color:var(--foreground)}
.ag-panel .ag-stile.now{border-color:transparent;color:#fff;background:radial-gradient(150% 170% at 100% 0%,#9b8bff 0%,#7256ec 50%,#5a3fd0 100%);box-shadow:0 18px 40px -24px rgba(90,63,208,.7)}
.ag-panel .ag-stile.now .ag-sn{background:rgba(255,255,255,.22);color:#fff}
.ag-panel .ag-stile.now .ag-sl{color:#fff}
.ag-panel .ag-snow{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.9}
.ag-panel .ag-stile.todo{opacity:.42}
.ag-panel .ag-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start}
.ag-panel .ag-col{display:flex;flex-direction:column;gap:18px}
.ag-panel .ag-attn{display:flex;align-items:center;gap:15px;text-decoration:none;color:#fff;border-radius:16px;padding:18px 20px;background:radial-gradient(150% 180% at 100% 0%,#9b8bff 0%,#7256ec 52%,#5a3fd0 100%);box-shadow:0 22px 50px -28px rgba(90,63,208,.7)}
.ag-panel .ag-attn-ic{width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.2);display:grid;place-items:center;flex:none}
.ag-panel .ag-attn-ic svg{width:20px;height:20px;stroke-width:1.8}
.ag-panel .ag-attn-tx b{font-size:15px;font-weight:500;display:block}
.ag-panel .ag-attn-tx small{font-size:12.5px;color:rgba(255,255,255,.85)}
.ag-panel .ag-attn-go{margin-left:auto;flex:none;opacity:.85}
.ag-panel .ag-attn-go svg{width:18px;height:18px}
.ag-panel .ag-rows{display:flex;flex-direction:column}
.ag-panel .ag-row{display:flex;align-items:center;gap:13px;padding:12px 2px;border-bottom:1px solid var(--border);text-decoration:none}
.ag-panel .ag-row:last-child{border-bottom:none}
.ag-panel .ag-row-ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--foreground) 6%,transparent);border:1px solid var(--border);color:var(--muted-foreground)}
.ag-panel .ag-row-ic svg{width:16px;height:16px;stroke-width:1.7}
.ag-panel .ag-row-tx b{font-size:13.5px;font-weight:500;display:block;color:var(--foreground)}
.ag-panel .ag-row-tx small{font-size:11.5px;color:var(--muted-foreground)}
.ag-panel .ag-pill{margin-left:auto;font-size:10.5px;font-weight:500;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground);white-space:nowrap}
.ag-panel .ag-pill.wait{background:rgba(114,86,236,.16);color:#8b73f5}
.ag-panel .ag-kv{display:flex;flex-direction:column;gap:12px}
.ag-panel .ag-kv > div{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ag-panel .ag-kv span{color:var(--muted-foreground);font-size:13px}
.ag-panel .ag-kv b{font-size:14px;font-weight:500}
.ag-panel .ag-btn{display:flex;justify-content:center;align-items:center;margin-top:16px;padding:11px;border-radius:11px;background:var(--foreground);color:var(--background);font-size:13.5px;font-weight:500;text-decoration:none}
@media (max-width:900px){
  .ag-panel .ag-grid{grid-template-columns:1fr}
  .ag-panel .ag-steps{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:120px;overflow-x:auto}
}
`
