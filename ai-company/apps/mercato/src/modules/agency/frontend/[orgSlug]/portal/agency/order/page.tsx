"use client"

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string } }

// STD-OFERTA (START-KOMUNIKACJI-PL-01). Shown read-only; the client never types
// SKU / price — they are copied from the catalog offer version. Swap to a live
// catalog fetch once the product is seeded (OM-01).
const PRODUCT = {
  sku: 'START-KOMUNIKACJI-PL-01',
  name: 'START KOMUNIKACJI',
  priceNet: 2500,
  currency: 'PLN',
  priceStatus: 'Proponowana cena pilotażowa — nieaktywna oferta sprzedaży.',
}

const GOAL_MAX = 240

type BuyerType = 'company' | 'individual'

type OrderForm = {
  brandDisplayName: string
  brandWebsiteUrl: string
  market: string
  language: string
  contactName: string
  contactEmail: string
  billingBuyerType: BuyerType
  billingLegalName: string
  billingCountry: string
  billingAddress: string
  billingTaxId: string
  officialSocialUrl: string
  purchaseGoal: string
  acceptTerms: boolean
}

const emptyForm: OrderForm = {
  brandDisplayName: '',
  brandWebsiteUrl: '',
  market: '',
  language: '',
  contactName: '',
  contactEmail: '',
  billingBuyerType: 'company',
  billingLegalName: '',
  billingCountry: '',
  billingAddress: '',
  billingTaxId: '',
  officialSocialUrl: '',
  purchaseGoal: '',
  acceptTerms: false,
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>
        {props.label}
        {props.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}

// Shape the submit payload as WEW-DANE-ZAMOWIENIA (per WZR-ZAMOWIENIE contract).
function toOrderData(form: OrderForm) {
  return {
    product_selection: {
      sku: PRODUCT.sku,
      offer_version: 'v1',
      price_net: PRODUCT.priceNet,
      currency: PRODUCT.currency,
    },
    brand: { display_name: form.brandDisplayName, website_url: form.brandWebsiteUrl },
    market_language: { market: form.market, language: form.language },
    buyer_contact: { name: form.contactName, email: form.contactEmail, contact_id: null },
    billing: {
      buyer_type: form.billingBuyerType,
      legal_name: form.billingLegalName,
      country: form.billingCountry,
      billing_address: form.billingAddress,
      tax_id: form.billingBuyerType === 'company' ? form.billingTaxId : 'not_applicable',
    },
    official_social: form.officialSocialUrl
      ? { url: form.officialSocialUrl, platform: null, provenance: 'client_provided' }
      : { url: null, platform: null, provenance: 'none_provided' },
    purchase_goal: form.purchaseGoal.trim() ? form.purchaseGoal.trim() : null,
    terms_confirmation: { terms_version: PRODUCT.sku, state: 'provided', event_ref: null },
  }
}

export default function AgencyOrderPage({ params }: Props) {
  const { orgSlug } = params
  const [form, setForm] = React.useState<OrderForm>(emptyForm)
  const [errors, setErrors] = React.useState<string[]>([])
  const [submitted, setSubmitted] = React.useState(false)

  const set = (key: keyof OrderForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const missing: string[] = []
    const req: [boolean, string][] = [
      [!form.brandDisplayName.trim(), 'Nazwa marki'],
      [!form.brandWebsiteUrl.trim(), 'Adres WWW'],
      [!form.market.trim(), 'Rynek'],
      [!form.language.trim(), 'Język'],
      [!form.contactName.trim(), 'Osoba kontaktowa'],
      [!form.contactEmail.trim(), 'E-mail kontaktowy'],
      [!form.billingLegalName.trim(), 'Nazwa prawna nabywcy'],
      [!form.billingCountry.trim(), 'Kraj'],
      [!form.billingAddress.trim(), 'Adres rozliczeniowy'],
      [form.billingBuyerType === 'company' && !form.billingTaxId.trim(), 'NIP (dla firmy)'],
      [!form.acceptTerms, 'Akceptacja warunków'],
    ]
    for (const [isMissing, label] of req) if (isMissing) missing.push(label)
    setErrors(missing)
    if (missing.length === 0) setSubmitted(true)
  }

  if (submitted) {
    const data = toOrderData(form)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PortalPageHeader label="Zamówienie" title="Dane przyjęte" />
        <PortalCard>
          <PortalCardHeader title="Podsumowanie (WEW-DANE-ZAMOWIENIA)" description="Na tej podstawie utworzymy zamówienie." />
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
        </PortalCard>
        <PortalCard className="border-dashed">
          <p className="text-sm text-muted-foreground">
            Następny krok (w budowie): utworzenie zamówienia na produkt {PRODUCT.sku} oraz płatność
            testowa. Po potwierdzeniu płatności system wyśle zdarzenie <code>agency.case.paid</code>,
            które uruchomi realizację po stronie agencji.
          </p>
        </PortalCard>
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setSubmitted(false)}>Wróć do edycji</Button>
          <Link href={`/${orgSlug}/portal/agency`}><Button variant="ghost">Do oferty</Button></Link>
        </div>
      </div>
    )
  }

  const goalLeft = GOAL_MAX - form.purchaseGoal.length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader
        label="Zamówienie"
        title="START KOMUNIKACJI"
        description="Podaj dane firmy i marki. Adres WWW jest wymagany — od niego zaczyna się audyt."
      />

      {errors.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="mb-1 font-medium">Uzupełnij wymagane pola:</p>
          <ul className="list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <PortalCard>
          <PortalCardHeader label="Produkt (z katalogu)" title={PRODUCT.name} description={PRODUCT.priceStatus} />
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">SKU</dt><dd>{PRODUCT.sku}</dd></div>
            <div><dt className="text-muted-foreground">Cena netto</dt><dd>{PRODUCT.priceNet} {PRODUCT.currency}</dd></div>
            <div><dt className="text-muted-foreground">Zakres</dt><dd>1 marka · 1 rynek · 1 język · 1 kanał</dd></div>
            <div><dt className="text-muted-foreground">Poprawki</dt><dd>bez limitu w zakresie</dd></div>
          </dl>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Marka i rynek" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="brandDisplayName" label="Nazwa marki" value={form.brandDisplayName} onChange={set('brandDisplayName')} required />
            <Field id="brandWebsiteUrl" label="Adres WWW" value={form.brandWebsiteUrl} onChange={set('brandWebsiteUrl')} required type="url" placeholder="https://" />
            <Field id="market" label="Rynek" value={form.market} onChange={set('market')} required placeholder="np. Polska" />
            <Field id="language" label="Język komunikacji" value={form.language} onChange={set('language')} required placeholder="np. polski" />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Kontakt kupującego" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="contactName" label="Osoba decyzyjna" value={form.contactName} onChange={set('contactName')} required />
            <Field id="contactEmail" label="E-mail" value={form.contactEmail} onChange={set('contactEmail')} required type="email" />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Dane nabywcy do rozliczenia" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingBuyerType">Typ nabywcy <span className="text-destructive">*</span></Label>
              <select
                id="billingBuyerType"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.billingBuyerType}
                onChange={(event) => setForm((prev) => ({ ...prev, billingBuyerType: event.target.value as BuyerType }))}
              >
                <option value="company">Firma</option>
                <option value="individual">Osoba prywatna</option>
              </select>
            </div>
            <Field id="billingLegalName" label="Nazwa prawna nabywcy" value={form.billingLegalName} onChange={set('billingLegalName')} required />
            <Field id="billingCountry" label="Kraj" value={form.billingCountry} onChange={set('billingCountry')} required placeholder="np. Polska" />
            <Field id="billingTaxId" label={form.billingBuyerType === 'company' ? 'NIP' : 'NIP (nie dotyczy)'} value={form.billingTaxId} onChange={set('billingTaxId')} required={form.billingBuyerType === 'company'} />
            <div className="sm:col-span-2">
              <Field id="billingAddress" label="Adres rozliczeniowy" value={form.billingAddress} onChange={set('billingAddress')} required />
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Oficjalny profil społecznościowy (opcjonalnie)" description="Jeden profil marki do audytu, jeśli istnieje." />
          <Field id="officialSocialUrl" label="Link do profilu" value={form.officialSocialUrl} onChange={set('officialSocialUrl')} type="url" placeholder="https://" />
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Cel w jednym zdaniu (opcjonalnie)" description="Wstępne oczekiwanie — nie zatwierdzony brief." />
          <Textarea
            id="purchaseGoal"
            value={form.purchaseGoal}
            maxLength={GOAL_MAX}
            onChange={(event) => set('purchaseGoal')(event.target.value)}
            rows={3}
            placeholder="np. uporządkować komunikację przed nową ofertą"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{goalLeft}/{GOAL_MAX}</p>
        </PortalCard>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={form.acceptTerms}
            onChange={(event) => setForm((prev) => ({ ...prev, acceptTerms: event.target.checked }))}
          />
          <span>
            Potwierdzam stałe warunki produktu {PRODUCT.name} (1 marka · 1 rynek · 1 język · 1 kanał;
            poprawki bez limitu w zakresie; cena {PRODUCT.priceNet} {PRODUCT.currency} netto).
          </span>
        </label>

        <div className="flex justify-between">
          <Link href={`/${orgSlug}/portal/agency`}><Button type="button" variant="outline">Wróć</Button></Link>
          <Button type="submit" size="lg">Złóż zamówienie</Button>
        </div>
      </form>
    </div>
  )
}
