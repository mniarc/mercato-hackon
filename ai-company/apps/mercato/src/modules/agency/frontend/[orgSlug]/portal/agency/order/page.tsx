"use client"

import * as React from 'react'
import Link from 'next/link'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useDemoPurchase } from '../../../../../components/purchase/useDemoPurchase'
import { DemoPurchaseStatus } from '../../../../../components/purchase/DemoPurchaseStatus'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string } }

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
  spokespeople: string
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
  spokespeople: '',
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

export default function AgencyOrderPage({ params }: Props) {
  const { orgSlug } = params
  const [form, setForm] = React.useState<OrderForm>(emptyForm)
  const [errors, setErrors] = React.useState<string[]>([])
  const t = useT()
  const locale = useLocale()
  const purchase = useDemoPurchase(orgSlug)
  const { offer, loading, busy, error, receipt } = purchase

  const set = (key: keyof OrderForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const missing: string[] = []
    const req: [boolean, string][] = [
      [!form.brandDisplayName.trim(), t('agency.order.brandName')],
      [!form.brandWebsiteUrl.trim(), t('agency.order.website')],
      [!form.market.trim(), t('agency.order.market')],
      [!form.language.trim(), t('agency.order.languageRequired')],
      [!form.contactName.trim(), t('agency.order.contactRequired')],
      [!form.contactEmail.trim(), t('agency.order.emailRequired')],
      [!form.billingLegalName.trim(), t('agency.order.legalName')],
      [!form.billingCountry.trim(), t('agency.order.country')],
      [!form.billingAddress.trim(), t('agency.order.billingAddress')],
      [form.billingBuyerType === 'company' && !form.billingTaxId.trim(), t('agency.order.taxIdRequired')],
      [!form.acceptTerms, t('agency.order.acceptTermsRequired')],
    ]
    for (const [isMissing, label] of req) if (isMissing) missing.push(label)
    setErrors(missing)
    if (missing.length === 0 && offer?.enabled && !busy) {
      const { acceptTerms: _accepted, ...buyer } = form
      await purchase.start(buyer)
    }
  }

  if (receipt) return <DemoPurchaseStatus receipt={receipt} orgSlug={orgSlug} enabled={offer?.enabled === true} busy={busy} error={error} confirm={purchase.confirm} refresh={purchase.refresh} retryPayment={purchase.retryPayment} />
  if (loading) return <LoadingMessage label={t('agency.purchase.loading', 'Loading the demo offer…')} />
  if (!offer) return <ErrorMessage label={error ?? t('agency.purchase.loadError', 'The demo offer is unavailable. Reload this page to try again.')} />

  const goalLeft = GOAL_MAX - form.purchaseGoal.length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PortalPageHeader
        label={t('agency.order.label')}
        title={offer.name}
        description={t('agency.order.description')}
      />

      {errors.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="mb-1 font-medium">{t('agency.order.requiredFields')}</p>
          <ul className="list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <ErrorMessage label={error} /> : null}
      {!offer.enabled ? <ErrorMessage label={t('agency.purchase.disabled', 'Demo checkout is disabled. An operator must enable the test purchase flow.')} /> : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <PortalCard>
          <PortalCardHeader label={t('agency.purchase.demoOffer', 'Demo offer')} title={offer.name} description={t('agency.purchase.noCharge', 'Demo only. No money is charged and no paid agent calls are authorized.')} />
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">{t('agency.order.sku')}</dt><dd>{offer.sku}</dd></div>
            <div><dt className="text-muted-foreground">{t('agency.purchase.testAmount', 'Test amount')}</dt><dd>{offer.amount} {offer.currency}</dd></div>
            <div><dt className="text-muted-foreground">{t('agency.order.scope')}</dt><dd>{t('agency.order.scopeValue')}</dd></div>
            <div><dt className="text-muted-foreground">{t('agency.order.revisions')}</dt><dd>{t('agency.order.revisionsValue')}</dd></div>
          </dl>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.brandMarket')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="brandDisplayName" label={t('agency.order.brandName')} value={form.brandDisplayName} onChange={set('brandDisplayName')} required />
            <Field id="brandWebsiteUrl" label={t('agency.order.website')} value={form.brandWebsiteUrl} onChange={set('brandWebsiteUrl')} required type="url" placeholder="https://" />
            <Field id="market" label={t('agency.order.market')} value={form.market} onChange={set('market')} required placeholder={t('agency.order.countryPlaceholder')} />
            <Field id="language" label={t('agency.order.language')} value={form.language} onChange={set('language')} required placeholder={t('agency.order.languagePlaceholder')} />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.buyerContact')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="contactName" label={t('agency.order.decisionMaker')} value={form.contactName} onChange={set('contactName')} required />
            <Field id="contactEmail" label={t('agency.order.email')} value={form.contactEmail} onChange={set('contactEmail')} required type="email" />
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.billing')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingBuyerType">{t('agency.order.buyerType')} <span className="text-destructive">*</span></Label>
              <select
                id="billingBuyerType"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={form.billingBuyerType}
                onChange={(event) => setForm((prev) => ({ ...prev, billingBuyerType: event.target.value as BuyerType }))}
              >
                <option value="company">{t('agency.order.company')}</option>
                <option value="individual">{t('agency.order.individual')}</option>
              </select>
            </div>
            <Field id="billingLegalName" label={t('agency.order.legalName')} value={form.billingLegalName} onChange={set('billingLegalName')} required />
            <Field id="billingCountry" label={t('agency.order.country')} value={form.billingCountry} onChange={set('billingCountry')} required placeholder={t('agency.order.countryPlaceholder')} />
            <Field id="billingTaxId" label={form.billingBuyerType === 'company' ? t('agency.order.taxId') : t('agency.order.taxIdNotApplicable')} value={form.billingTaxId} onChange={set('billingTaxId')} required={form.billingBuyerType === 'company'} />
            <div className="sm:col-span-2">
              <Field id="billingAddress" label={t('agency.order.billingAddress')} value={form.billingAddress} onChange={set('billingAddress')} required />
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.social')} description={t('agency.order.socialHint')} />
          <Field id="officialSocialUrl" label={t('agency.order.socialLink')} value={form.officialSocialUrl} onChange={set('officialSocialUrl')} type="url" placeholder="https://" />
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.spokespeople')} description={t('agency.order.spokespeopleHint')} />
          <Textarea
            id="spokespeople"
            value={form.spokespeople}
            maxLength={2000}
            onChange={(event) => set('spokespeople')(event.target.value)}
            rows={3}
            placeholder={t('agency.order.spokespeoplePlaceholder')}
          />
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.order.goal')} description={t('agency.order.goalHint')} />
          <Textarea
            id="purchaseGoal"
            value={form.purchaseGoal}
            maxLength={GOAL_MAX}
            onChange={(event) => set('purchaseGoal')(event.target.value)}
            rows={3}
            placeholder={t('agency.order.goalPlaceholder')}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{goalLeft}/{GOAL_MAX}</p>
        </PortalCard>

        <PortalCard>
          <PortalCardHeader title={t('agency.purchase.terms', 'Demo terms')} description={`${t('agency.purchase.termsVersion', 'Terms version')}: ${offer.termsVersion} · ${t('agency.purchase.offerVersion', 'Offer version')}: ${offer.offerVersion}`} />
          <p className="whitespace-pre-wrap text-sm">{locale === 'pl' ? offer.terms.pl : offer.terms.en}</p>
        </PortalCard>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.acceptTerms} disabled={!offer.enabled || busy}
            onChange={(event) => setForm((prev) => ({ ...prev, acceptTerms: event.target.checked }))} />
          <span>{t('agency.purchase.acceptTerms', 'I accept the exact demo terms shown above. No money will be charged.')} ({offer.termsVersion})</span>
        </label>

        <div className="flex justify-between">
          <Link href={`/${orgSlug}/portal/agency`}><Button type="button" variant="outline">{t('agency.order.back')}</Button></Link>
          <Button type="submit" size="lg" disabled={!offer.enabled || busy}>{t('agency.purchase.start', 'Create demo order — no charge')}</Button>
        </div>
      </form>
    </div>
  )
}
