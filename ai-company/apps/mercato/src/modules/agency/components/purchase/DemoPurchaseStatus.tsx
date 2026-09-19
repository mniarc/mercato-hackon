'use client'

import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import type { DemoPurchaseReceipt } from './useDemoPurchase'

export function DemoPurchaseStatus({ receipt, orgSlug, enabled, busy, error, confirm, refresh, retryPayment }: {
  receipt: DemoPurchaseReceipt; orgSlug: string; enabled: boolean; busy: boolean; error: string | null; confirm: () => Promise<void>; refresh: () => Promise<void>; retryPayment: () => Promise<void>;
}) {
  const t = useT()
  const completed = receipt.status === 'paid' && receipt.caseId !== null
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <PortalCard>
      <PortalCardHeader title={t('agency.purchase.received', 'Demo order recorded')} description={t('agency.purchase.noCharge', 'Demo only. No money is charged and no paid agent calls are authorized.')} />
      <p className="text-sm">{completed ? t('agency.purchase.paid', 'Test payment confirmed. Your agency case is ready to open.')
        : receipt.canRetryPayment ? t('agency.purchase.paymentFailed')
          : receipt.status === 'pending_payment' ? t('agency.purchase.pending', 'The server is awaiting test payment confirmation.')
          : t('agency.purchase.blocked', 'This purchase requires attention before the agency process can continue.')}</p>
      <p className="mt-2 break-all text-xs text-muted-foreground">{t('agency.purchase.orderId', 'Order')}: {receipt.orderId}</p>
      {receipt.reason ? <p className="mt-2 text-sm text-muted-foreground">{t('agency.purchase.reason', 'Recorded reason')}: {receipt.reason}</p> : null}
      {completed && receipt.processing ? <div className="mt-4 space-y-2 text-sm" role="status">
        <p>{t(`agency.purchase.processing.${receipt.processing.state}`)}</p>
        {'reason' in receipt.processing ? <p className="text-muted-foreground">{t(`agency.purchase.processing.reason.${receipt.processing.reason}`)}</p> : null}
        {'nativeStatus' in receipt.processing ? <p className="text-muted-foreground">{t('agency.purchase.processing.nativeStatus')}: {receipt.processing.nativeStatus}</p> : null}
      </div> : null}
    </PortalCard>
    {error ? <ErrorMessage label={error} /> : null}
    <div className="flex flex-wrap gap-3">
      {completed ? <Button asChild><Link href={`/${orgSlug}/portal/agency/cases/${encodeURIComponent(receipt.caseId!)}`}>{t('agency.purchase.openCase', 'Open your agency case')}</Link></Button> : null}
      {receipt.canRetryPayment ? <Button disabled={!enabled || busy} onClick={() => { void retryPayment() }}>{t('agency.purchase.retryPayment')}</Button>
        : receipt.canConfirmPayment ? <Button disabled={!enabled || busy} onClick={() => { void confirm() }}>{receipt.status === 'blocked' ? t('agency.purchase.retryConfirm', 'Retry confirmation — no charge') : t('agency.purchase.confirm', 'Confirm test payment — no charge')}</Button> : null}
      <Button variant="outline" disabled={busy} onClick={() => { void refresh() }}>{t('agency.purchase.refresh', 'Refresh payment status')}</Button>
      <Button asChild variant="ghost"><Link href={`/${orgSlug}/portal/agency`}>{t('agency.purchase.back', 'Back to offer')}</Link></Button>
    </div>
  </div>
}
