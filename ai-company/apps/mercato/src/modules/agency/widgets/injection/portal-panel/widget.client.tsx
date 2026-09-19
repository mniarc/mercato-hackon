"use client"

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

const PANEL_CSS = `
.ag-panel{display:flex;flex-direction:column;gap:18px}
.ag-panel .ag-block{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(16px);border-radius:16px;padding:18px 20px}
.ag-panel .ag-block-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.ag-panel .ag-block-h h3{font-size:15px;font-weight:500;margin:0}
.ag-panel .ag-sub{font-size:12px;color:var(--muted-foreground);margin-top:2px}
.ag-panel .ag-meta{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums;white-space:nowrap}
.ag-panel .ag-skel{height:16px;border-radius:6px;background:color-mix(in srgb,var(--foreground) 8%,transparent);margin-bottom:10px}
.ag-panel .ag-skel.short{width:40%}
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
.ag-panel .ag-rows{display:flex;flex-direction:column}
.ag-panel .ag-row{display:flex;align-items:center;gap:13px;padding:12px 2px;border-bottom:1px solid var(--border);text-decoration:none}
.ag-panel .ag-row:last-child{border-bottom:none}
.ag-panel .ag-row-tx{min-width:0}
.ag-panel .ag-row-tx b{font-size:13.5px;font-weight:500;display:block;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-panel .ag-row-tx small{font-size:11.5px;color:var(--muted-foreground)}
.ag-panel .ag-pill{margin-left:auto;font-size:10.5px;font-weight:500;padding:4px 10px;border-radius:999px;white-space:nowrap;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground)}
.ag-panel .ag-pill.t-hold{background:rgba(224,144,42,.16);color:#e0902a}
.ag-panel .ag-pill.t-done{background:rgba(45,150,90,.16);color:#3fae6b}
.ag-panel .ag-pill.t-run{background:rgba(114,86,236,.16);color:#8b73f5}
.ag-panel .ag-pill.t-stop{background:color-mix(in srgb,var(--foreground) 10%,transparent);color:var(--muted-foreground)}
.ag-panel .ag-kv{display:flex;flex-direction:column;gap:12px}
.ag-panel .ag-kv > div{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ag-panel .ag-kv span{color:var(--muted-foreground);font-size:13px}
.ag-panel .ag-kv b{font-size:14px;font-weight:500}
.ag-panel .ag-btn{display:flex;justify-content:center;align-items:center;margin-top:16px;padding:11px;border-radius:11px;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--foreground);font-size:13.5px;font-weight:500;text-decoration:none;border:1px solid var(--border)}
.ag-panel .ag-btn-primary{background:#7256ec;color:#fff;border-color:transparent;margin-top:18px}
.ag-panel .ag-empty{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(16px);border-radius:16px;padding:40px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.ag-panel .ag-empty b{font-size:16px;font-weight:500}
.ag-panel .ag-empty p{font-size:13px;color:var(--muted-foreground);max-width:42ch;margin:0}
@media (max-width:900px){
  .ag-panel .ag-grid{grid-template-columns:1fr}
  .ag-panel .ag-steps{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:120px;overflow-x:auto}
}
`
