import { fitClientView } from '../lib/research/clientView'
import { countClientWords } from '../lib/research/util'

const sentence = (n: number) => `Zdanie numer ${n} mówi coś o firmie i jej ofercie dla klientów biznesowych.`
const paragraph = (count: number) => Array.from({ length: count }, (_, i) => sentence(i + 1)).join(' ')

describe('client view fitting', () => {
  it('leaves a view within budget untouched', () => {
    const lines = ['# Tytuł', '', '**Etykieta:** ' + paragraph(2)]
    const view = fitClientView('WZR-TOV', lines, 'pl')
    expect(view.markdown).toBe(lines.join('\n'))
    expect(view.issue).toBeNull()
  })

  it('cuts body lines to their first sentences before dropping anything, keeps headings and labels, and says so', () => {
    const lines = ['# Ton głosu', '', ...Array.from({ length: 30 }, (_, i) => `**Zasada ${i + 1}:** ${paragraph(6)}`)]
    const view = fitClientView('WZR-TOV', lines, 'pl')
    expect(view.limit).toBe(750)
    expect(countClientWords(view.markdown)).toBeLessThanOrEqual(750)
    expect(view.issue).toBeNull()
    expect(view.markdown).toContain('# Ton głosu')
    expect(view.markdown).toContain('**Zasada 1:** Zdanie numer 1')
    expect(view.markdown).toContain('Skrócono do limitu')
  })

  it('drops trailing lines only when single sentences still exceed the budget', () => {
    const lines = ['# Strategia', '', ...Array.from({ length: 400 }, (_, i) => `- Punkt ${i + 1}: ${sentence(i)}`)]
    const view = fitClientView('WZR-STRATEGIA', lines, 'en')
    expect(countClientWords(view.markdown)).toBeLessThanOrEqual(1100)
    expect(view.markdown).toContain('- Punkt 1:')
    expect(view.markdown).not.toContain('- Punkt 400:')
    expect(view.markdown).toContain('Shortened to the client-view word budget')
  })
})
