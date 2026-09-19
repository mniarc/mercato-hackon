export const OFFER_CSS = `
.ag-offer-grid{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;align-items:start}
.ag-offer-aside{position:sticky;top:88px}
.agency-price .apx-list{list-style:none;margin:16px 0 20px;padding:0;display:flex;flex-direction:column;gap:10px}
.agency-price .apx-list li{position:relative;display:flex;gap:9px;align-items:flex-start;font-size:13.5px;color:rgba(255,255,255,.94)}
.agency-price .apx-list li svg{width:16px;height:16px;flex:none;margin-top:1px;opacity:.9}
.agency-price .apx-cta{display:flex;justify-content:center;align-items:center;width:100%;padding:12px;border-radius:12px;background:#fff;color:var(--agency-gradient-end,#5a3fd0);font-size:14px;font-weight:var(--agency-heading-weight,500);text-decoration:none}
.agency-price .apx-cta:hover{filter:brightness(1.02)}
@media (max-width:900px){ .ag-offer-grid{grid-template-columns:1fr} .ag-offer-aside{position:static} }
`
