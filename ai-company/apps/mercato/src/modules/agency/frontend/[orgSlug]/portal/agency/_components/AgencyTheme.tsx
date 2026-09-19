"use client"

import type { ReactNode } from 'react'

/**
 * Studio Komunikacji portal skin: wide thin Archivo typography, glass cards,
 * violet primary and a violet price card — applied via scoped DS token overrides
 * so every portal page adopts the look without rewriting each component.
 */
export function AgencyTheme({ children }: { children: ReactNode }) {
  return (
    <div className="agency-portal">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" />
      <style>{THEME_CSS}</style>
      {children}
    </div>
  )
}

const THEME_CSS = `
.agency-portal{font-family:"Archivo",system-ui,-apple-system,Segoe UI,sans-serif;font-variation-settings:"wdth" 118;font-weight:300;letter-spacing:0;--radius:1.05rem;--primary:#6e56e6;--primary-foreground:#ffffff;--ring:#7256ec}
.agency-portal :is(h1,h2,h3,h4){font-weight:500;letter-spacing:-.01em}
.agency-portal :is(.font-bold,.font-semibold,.font-medium){font-weight:500}
.agency-portal b,.agency-portal strong{font-weight:500}
.agency-portal .bg-card{background:color-mix(in srgb, var(--card) 78%, transparent);backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15)}
.agency-price{position:relative;overflow:hidden;border-radius:var(--radius);padding:24px;color:#fff;background:radial-gradient(150% 170% at 100% 0%,#9b8bff 0%,#7256ec 50%,#5a3fd0 100%);box-shadow:0 24px 60px -30px rgba(90,63,208,.6)}
.agency-price::after{content:"";position:absolute;right:-50px;top:-50px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.12)}
.agency-price .apx-tag{position:relative;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;background:rgba(255,255,255,.2);padding:5px 11px;border-radius:999px}
.agency-price .apx-amt{position:relative;font-size:40px;font-weight:500;margin:16px 0 4px;line-height:1}
.agency-price .apx-amt span{font-size:16px;opacity:.85}
.agency-price .apx-note{position:relative;font-size:13.5px;color:rgba(255,255,255,.85);margin:0}
.agency-price .apx-meta{position:relative;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;color:rgba(255,255,255,.9);margin-top:14px}
.agency-bullets{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
.agency-bullets li{display:flex;gap:11px;font-size:14px;line-height:1.55}
.agency-bullets li::before{content:"";flex:none;width:6px;height:6px;border-radius:999px;margin-top:9px;background:#7256ec}
`
