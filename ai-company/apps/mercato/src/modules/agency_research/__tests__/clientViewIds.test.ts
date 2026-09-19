import { stripEvidenceIds } from '../lib/research/clientView'

describe('client view — evidence ids never reach the client', () => {
  it('removes bracketed id groups, "w L01, L02" runs and bare ids, and keeps the words', () => {
    expect(stripEvidenceIds('metodą „pięć warstw” z selektywnym stosowaniem AI (F01, F03, F04, F07, F09), oraz (b) partnerstwo (F10).'))
      .toBe('metodą „pięć warstw” z selektywnym stosowaniem AI, oraz (b) partnerstwo.')
    expect(stripEvidenceIds('krótkie zdania (widoczne w L01, L02, L03), kontrast (L02, L04) — bez decyzji (Q01); profil naukowy (T06/T12, P03).'))
      .toBe('krótkie zdania (widoczne), kontrast — bez decyzji; profil naukowy.')
    expect(stripEvidenceIds('wymaga decyzji klienta (Q02). Wariant VOICE-A brzmi jak FLOW i S-12 mówi o tym w F58, F61–F64.'))
      .toBe('wymaga decyzji klienta. Wariant brzmi jak FLOW i mówi o tym.')
  })

  it('leaves ordinary text, brand names and numbers alone', () => {
    const text = 'FLOW Centrum Badawcze, program HugeTECH Revolution, grant LIDER XV, 150 startupów, A/B testy, rok 2026.'
    expect(stripEvidenceIds(text)).toBe(text)
  })
})

it('leaves no stubs behind a stripped comparison or dash', () => {
  expect(stripEvidenceIds('kontrastuje z osobistym tonem Mudy (L05 vs L35).')).toBe('kontrastuje z osobistym tonem Mudy.')
  expect(stripEvidenceIds('bez danych — F58, F61–F64.')).toBe('bez danych.')
})
