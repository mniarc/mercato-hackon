import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'

export const demoOffer = {
  demoOnly: true,
  sku: 'START-KOMUNIKACJI-PL-01-DEMO',
  name: 'START KOMUNIKACJI — DEMO',
  amount: 2500,
  currency: 'PLN',
  offerVersion: 'demo-2026-09-19-v1',
  termsVersion: 'demo-2026-09-19-v1',
  provider: 'mock_processing',
  terms: {
    en: 'Demo only: the displayed 2,500 PLN is a simulated order amount. No money is charged, no invoice or real service purchase is created, and no paid agent run or publication is authorized. Confirmation records a test payment and creates an agency case awaiting execution.',
    pl: 'Wyłącznie demonstracja: widoczne 2500 PLN to symulowana kwota zamówienia. Nie pobieramy pieniędzy, nie wystawiamy faktury ani nie zawieramy rzeczywistego zakupu usługi. Nie upoważnia to do płatnych wywołań agentów ani publikacji. Potwierdzenie zapisuje płatność testową i tworzy sprawę agencji oczekującą na realizację.',
  },
} as const

export function isDemoPurchaseEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    && parseBooleanToken(process.env.OM_AGENCY_DEMO_PURCHASE_ENABLED) === true
}

export function readDemoOffer() {
  return { ...demoOffer, enabled: isDemoPurchaseEnabled() }
}
