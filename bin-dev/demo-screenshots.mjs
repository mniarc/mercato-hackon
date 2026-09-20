#!/usr/bin/env node
// Screenshots of the customer journey, one per step with its document expanded, plus the
// agents board per step — for the presentation deck. Uses the system Chrome (headless).
//   node bin-dev/demo-screenshots.mjs <caseId> [outDir]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'ai-company', 'package.json'))
const { chromium } = require('playwright')

const [caseId, outDirArg] = process.argv.slice(2)
if (!caseId) { console.error('usage: node bin-dev/demo-screenshots.mjs <caseId> [outDir]'); process.exit(1) }
const outDir = outDirArg ?? join(process.env.USERPROFILE, 'Downloads', `demo-screenshots-${caseId.slice(0, 8)}`)
mkdirSync(outDir, { recursive: true })

const base = 'http://localhost:3000'
const org = 'acme-corp'
const steps = ['Badania', 'Brief', 'Strategia + Tone of Voice', 'Plan treści', 'Post w produkcji', 'Treść postu', 'Publikacja', 'Pakiet i zamknięcie']

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'pl-PL' })
const page = await context.newPage()

await page.goto(`${base}/${org}/portal/login`)
await page.getByRole('textbox', { name: /e-?mail/i }).fill('client@openmercato.demo')
await page.locator('#login-password').fill('ClientDemo2026!')
await page.getByRole('button', { name: /zaloguj|log in|sign in/i }).click()
await page.waitForURL((url) => !url.pathname.endsWith('/portal/login'), { timeout: 30_000 })
await page.waitForLoadState('networkidle').catch(() => {})

const journey = `${base}/${org}/portal/agency/cases/${caseId}/journey`
await page.goto(journey, { waitUntil: 'domcontentloaded' }).catch(async () => { await page.waitForTimeout(1500); await page.goto(journey, { waitUntil: 'domcontentloaded' }) })
await page.getByRole('heading', { name: /Twoje zlecenie/ }).waitFor({ timeout: 30_000 })
await page.waitForTimeout(1500)
// The demo-instance banner floats over the bottom of the page and intercepts clicks.
await page.addStyleTag({ content: '.z-banner { display: none !important; }' })
await page.screenshot({ path: join(outDir, '00-przebieg.png'), fullPage: false })

for (const [index, label] of steps.entries()) {
  const number = String(index + 1).padStart(2, '0')
  await page.getByRole('tab', { name: 'Klient' }).click()
  await page.getByRole('button', { name: label, exact: false }).first().click({ force: true })
  await page.waitForTimeout(800)
  const showButtons = page.getByRole('button', { name: /Pokaż dokument/ })
  const count = await showButtons.count()
  for (let i = 0; i < count; i += 1) {
    await showButtons.nth(0).click({ force: true })
    await page.waitForTimeout(1500)
  }
  await page.screenshot({ path: join(outDir, `${number}-${slug(label)}-klient.png`), fullPage: true })
  await page.getByRole('tab', { name: 'Agenci' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(outDir, `${number}-${slug(label)}-agenci.png`), fullPage: true })
  console.log(`${number} ${label}: ${count} document(s)`)
}

await browser.close()
console.log(`→ ${outDir}`)

function slug(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
