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

type OrderForm = {
  brandName: string
  website: string
  market: string
  language: string
  contactName: string
  contactEmail: string
  contactPhone: string
  billingCompany: string
  billingTaxId: string
  billingAddress: string
  goal: string
  acceptTerms: boolean
}

const emptyForm: OrderForm = {
  brandName: '',
  website: '',
  market: '',
  language: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  billingCompany: '',
  billingTaxId: '',
  billingAddress: '',
  goal: '',
  acceptTerms: false,
}

const requiredFields: { key: keyof OrderForm; label: string }[] = [
  { key: 'brandName', label: 'Nazwa marki' },
  { key: 'website', label: 'Adres WWW' },
  { key: 'market', label: 'Rynek' },
  { key: 'language', label: 'Język' },
  { key: 'contactName', label: 'Osoba kontaktowa' },
  { key: 'contactEmail', label: 'E-mail kontaktowy' },
]

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
        {props.required ? <span className="text-status-danger-foreground"> *</span> : null}
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

export default function AgencyOrderPage({ params }: Props) {
  const { orgSlug } = params
  const [form, setForm] = React.useState<OrderForm>(emptyForm)
  const [errors, setErrors] = React.useState<string[]>([])
  const [submitted, setSubmitted] = React.useState(false)

  const set = (key: keyof OrderForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const missing = requiredFields.filter((field) => !String(form[field.key]).trim()).map((field) => field.label)
    if (!form.acceptTerms) missing.push('Akceptacja warunków')
    setErrors(missing)
    if (missing.length === 0) setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PortalPageHeader label="Zamówienie" title="Dane przyjęte" />
        <PortalCard>
          <PortalCardHeader title="Podsumowanie" description="To są dane, na podstawie których utworzymy zamówienie." />
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Marka</dt><dd>{form.brandName}</dd></div>
            <div><dt className="text-muted-foreground">WWW</dt><dd>{form.website}</dd></div>
            <div><dt className="text-muted-foreground">Rynek</dt><dd>{form.market}</dd></div>
            <div><dt className="text-muted-foreground">Język</dt><dd>{form.language}</dd></div>
            <div><dt className="text-muted-foreground">Kontakt</dt><dd>{form.contactName}</dd></div>
            <div><dt className="text-muted-foreground">E-mail</dt><dd>{form.contactEmail}</dd></div>
          </dl>
        </PortalCard>
        <PortalCard className="border-dashed">
          <p className="text-sm text-muted-foreground">
            Następny krok (w budowie): utworzenie zamówienia na produkt START KOMUNIKACJI oraz płatność
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader
        label="Zamówienie"
        title="START KOMUNIKACJI"
        description="Podaj dane firmy i marki. Adres WWW jest wymagany — od niego zaczyna się audyt."
      />

      {errors.length > 0 ? (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-subtle p-4 text-sm text-status-danger-foreground">
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
          <PortalCardHeader title="Marka i rynek" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="brandName" label="Nazwa marki" value={form.brandName} onChange={set('brandName')} required />
            <Field id="website" label="Adres WWW" value={form.website} onChange={set('website')} required placeholder="https://" type="url" />
            <Field id="market" label="Rynek" value={form.market} onChange={set('market')} required placeholder="np. Polska" />
            <Field id="language" label="Język komunikacji" value={form.language} onChange={set('language')} required placeholder="np. polski" />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Kontakt" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="contactName" label="Osoba decyzyjna" value={form.contactName} onChange={set('contactName')} required />
            <Field id="contactEmail" label="E-mail" value={form.contactEmail} onChange={set('contactEmail')} required type="email" />
            <Field id="contactPhone" label="Telefon (opcjonalnie)" value={form.contactPhone} onChange={set('contactPhone')} />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Dane rozliczeniowe" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="billingCompany" label="Firma" value={form.billingCompany} onChange={set('billingCompany')} />
            <Field id="billingTaxId" label="NIP" value={form.billingTaxId} onChange={set('billingTaxId')} />
            <div className="sm:col-span-2">
              <Field id="billingAddress" label="Adres" value={form.billingAddress} onChange={set('billingAddress')} />
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title="Cel (opcjonalnie)" description="Co chcesz osiągnąć tą komunikacją? Pomożemy doprecyzować przy briefie." />
          <Textarea
            id="goal"
            value={form.goal}
            onChange={(event) => set('goal')(event.target.value)}
            rows={4}
            placeholder="np. pozyskać klientów B2B w segmencie..."
          />
        </PortalCard>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={form.acceptTerms}
            onChange={(event) => setForm((prev) => ({ ...prev, acceptTerms: event.target.checked }))}
          />
          <span>
            Potwierdzam stałe warunki produktu START KOMUNIKACJI (1 marka · 1 rynek · 1 język · 1 kanał;
            poprawki bez limitu w zakresie; cena 2500 PLN netto).
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
