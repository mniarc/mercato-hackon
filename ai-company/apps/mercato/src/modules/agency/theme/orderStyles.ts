export const ORDER_CSS = `
        .agency-order{font-family:var(--agency-display-font,"Archivo"),system-ui,sans-serif;font-variation-settings:"wdth" var(--agency-detail-font-width,118);font-weight:var(--agency-body-weight,300);letter-spacing:0}
        .agency-order h1,.agency-order h2,.agency-order h3{font-weight:var(--agency-heading-weight,500)}
        .agency-order b,.agency-order strong{font-weight:var(--agency-heading-weight,500)}
        .agency-price{position:relative;overflow:hidden;border-radius:18px;padding:24px;color:#fff;
          background:radial-gradient(150% 170% at 100% 0%,var(--agency-gradient-start,#9b8bff) 0%,var(--agency-accent,#7256ec) 50%,var(--agency-gradient-end,#5a3fd0) 100%);
          box-shadow:0 24px 60px -30px rgba(var(--agency-shadow-rgb,90,63,208),.6)}
        .agency-price::after{content:"";position:absolute;right:-50px;top:-50px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.12)}
        .agency-price .apx-tag{position:relative;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:var(--agency-heading-weight,500);letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.2);padding:5px 11px;border-radius:999px}
        .agency-price .apx-amt{position:relative;font-size:38px;font-weight:var(--agency-heading-weight,500);margin:16px 0 2px;line-height:1}
        .agency-price .apx-amt span{font-size:15px;opacity:.85}
        .agency-price .apx-note{position:relative;font-size:13px;color:rgba(255,255,255,.85);margin:0 0 8px}
        .agency-price .apx-meta{position:relative;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;color:rgba(255,255,255,.9);margin-top:12px}
        .agency-bullets{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
        .agency-bullets li{display:flex;gap:10px;font-size:14px;line-height:1.5}
        .agency-bullets li::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;margin-top:9px;background:currentColor;opacity:.35}
      `
