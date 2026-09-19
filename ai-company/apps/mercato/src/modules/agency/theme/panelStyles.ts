export const PANEL_CSS = `
.ag-panel{display:flex;flex-direction:column;gap:18px}
.ag-panel .ag-block{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(16px);border-radius:16px;padding:18px 20px}
.ag-panel .ag-block-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.ag-panel .ag-block-h h3{font-size:15px;font-weight:var(--agency-heading-weight,500);margin:0}
.ag-panel .ag-sub{font-size:12px;color:var(--muted-foreground);margin-top:2px}
.ag-panel .ag-meta{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums;white-space:nowrap}
.ag-panel .ag-skel{height:16px;border-radius:6px;background:color-mix(in srgb,var(--foreground) 8%,transparent);margin-bottom:10px}
.ag-panel .ag-skel.short{width:40%}
.ag-panel .ag-steps{display:grid;grid-template-columns:repeat(8,1fr);gap:9px}
.ag-panel .ag-stile{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 50%,transparent);border-radius:13px;padding:13px 11px;min-height:92px;display:flex;flex-direction:column;gap:9px;justify-content:space-between}
.ag-panel .ag-sn{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-size:12px;font-weight:var(--agency-heading-weight,500);background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.ag-panel .ag-sl{font-size:11.5px;color:var(--muted-foreground);line-height:1.25}
.ag-panel .ag-stile.done .ag-sn{background:var(--foreground);color:var(--background)}
.ag-panel .ag-stile.done .ag-sl{color:var(--foreground)}
.ag-panel .ag-stile.now{border-color:transparent;color:#fff;background:radial-gradient(150% 170% at 100% 0%,var(--agency-gradient-start,#9b8bff) 0%,var(--agency-accent,#7256ec) 50%,var(--agency-gradient-end,#5a3fd0) 100%);box-shadow:0 18px 40px -24px rgba(var(--agency-shadow-rgb,90,63,208),.7)}
.ag-panel .ag-stile.now .ag-sn{background:rgba(255,255,255,.22);color:#fff}
.ag-panel .ag-stile.now .ag-sl{color:#fff}
.ag-panel .ag-snow{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.9}
.ag-panel .ag-stile.todo{opacity:.42}
.ag-panel .ag-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start}
.ag-panel .ag-rows{display:flex;flex-direction:column}
.ag-panel .ag-row{display:flex;align-items:center;gap:13px;padding:12px 2px;border-bottom:1px solid var(--border);text-decoration:none}
.ag-panel .ag-row:last-child{border-bottom:none}
.ag-panel .ag-row-tx{min-width:0}
.ag-panel .ag-row-tx b{font-size:13.5px;font-weight:var(--agency-heading-weight,500);display:block;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-panel .ag-row-tx small{font-size:11.5px;color:var(--muted-foreground)}
.ag-panel .ag-pill{margin-left:auto;font-size:10.5px;font-weight:var(--agency-heading-weight,500);padding:4px 10px;border-radius:999px;white-space:nowrap;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--muted-foreground)}
.ag-panel .ag-pill.t-hold{background:rgba(224,144,42,.16);color:#e0902a}
.ag-panel .ag-pill.t-done{background:rgba(45,150,90,.16);color:#3fae6b}
.ag-panel .ag-pill.t-run{background:rgba(114,86,236,.16);color:#8b73f5}
.ag-panel .ag-pill.t-stop{background:color-mix(in srgb,var(--foreground) 10%,transparent);color:var(--muted-foreground)}
.ag-panel .ag-kv{display:flex;flex-direction:column;gap:12px}
.ag-panel .ag-kv > div{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.ag-panel .ag-kv span{color:var(--muted-foreground);font-size:13px}
.ag-panel .ag-kv b{font-size:14px;font-weight:var(--agency-heading-weight,500)}
.ag-panel .ag-btn{display:flex;justify-content:center;align-items:center;margin-top:16px;padding:11px;border-radius:11px;background:color-mix(in srgb,var(--foreground) 8%,transparent);color:var(--foreground);font-size:13.5px;font-weight:var(--agency-heading-weight,500);text-decoration:none;border:1px solid var(--border)}
.ag-panel .ag-btn-primary{background:var(--agency-accent,#7256ec);color:#fff;border-color:transparent;margin-top:18px}
.ag-panel .ag-empty{border:1px solid var(--border);background:color-mix(in srgb,var(--card) 60%,transparent);backdrop-filter:blur(16px);border-radius:16px;padding:40px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.ag-panel .ag-empty b{font-size:16px;font-weight:var(--agency-heading-weight,500)}
.ag-panel .ag-empty p{font-size:13px;color:var(--muted-foreground);max-width:42ch;margin:0}
@media (max-width:900px){
  .ag-panel .ag-grid{grid-template-columns:1fr}
  .ag-panel .ag-steps{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:120px;overflow-x:auto}
}
`
