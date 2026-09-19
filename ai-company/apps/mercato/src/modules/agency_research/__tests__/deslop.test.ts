import { readFileSync } from 'node:fs'
import path from 'node:path'
import { scanSlop, slopValidatorFindings } from '../lib/research/deslop'
import { DESLOP_DETECT_FOR_EDITOR, DESLOP_PROSE_RULES, DESLOP_WRITE_UNDER_PROFILE } from '../lib/agents/deslop'
import { postAgents } from '../lib/agents/post'
import { adapterFor } from '../data/adapters'

const cannedPost = (JSON.parse(readFileSync(path.join(__dirname, '../__fixtures__/flow/canned/agency_research.post_author.json'), 'utf8')) as Array<{ data: { text: string } }>)[0].data.text

describe('deslop — deterministic half', () => {
  it('leaves the canned FLOW post and its hygiene alone', () => {
    expect(scanSlop(cannedPost)).toEqual([])
    expect(slopValidatorFindings(cannedPost)).toEqual([])
  })

  it('names the catalogue pattern, quotes the fragment and gives a fix', () => {
    const text = 'Prawda jest taka: większość firm robi to źle.\n\nPodsumowując, warto podkreślić, że badania pokazują przełomowe efekty.'
    const hits = scanSlop(text)
    expect(hits.map((hit) => hit.pattern)).toEqual(expect.arrayContaining(['throat-clearing opener', 'faux-insight setup', 'recap ending', 'importance label', 'weasel attribution', 'importance puffery']))
    for (const hit of hits) {
      expect(hit.fragment && text.toLowerCase().includes(hit.fragment.toLowerCase())).toBe(true)
      expect(hit.fix.split(/\s+/).length).toBeLessThanOrEqual(10)
    }
  })

  it('catches English patterns, binary contrast and the social openers', () => {
    const hits = scanSlop("Hot take: it's not about the model, it's about the eval.\n\nMoreover, experts agree this is a game changer. In conclusion, delve in!")
    expect(hits.map((hit) => hit.pattern)).toEqual(expect.arrayContaining(['channel opener', 'binary contrast', 'response-shaped connector', 'weasel attribution', 'importance puffery', 'recap ending', 'inflation word']))
  })

  it('applies the budgets, not bans: one dash or one exclamation mark passes, stacks do not', () => {
    expect(scanSlop('Jedno zdanie — z myślnikiem. Drugie bez!').filter((hit) => hit.fragment === null)).toEqual([])
    const stacked = scanSlop('A — b — c — d! Naprawdę! #jeden #dwa #trzy #cztery')
    expect(stacked.map((hit) => hit.pattern)).toEqual(expect.arrayContaining(['em-dash habit', 'exclamation habit', 'hashtag stack']))
  })

  it('flags line-per-sentence drama, markdown and emoji bullets in a post', () => {
    const drama = 'Zaczynamy.\nKażde zdanie osobno.\nDla efektu.\nTo działa.\nAlbo nie.\nKoniec.'
    expect(scanSlop(drama).map((hit) => hit.pattern)).toContain('line-per-sentence drama')
    expect(scanSlop('## Nagłówek\n\nZdanie z **pogrubieniem** w środku.').map((hit) => hit.pattern)).toContain('markdown in a social post')
    expect(scanSlop('✅ punkt pierwszy\n✅ punkt drugi').map((hit) => hit.pattern)).toContain('emoji bullets')
  })

  it('returns Q-T findings that never block on their own and escalate to major when patterns stack', () => {
    const one = slopValidatorFindings('Ponadto, to działa.')
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ code: 'slop_pattern', severity: 'minor', owner: 'agent', fix_step: '7.2' })
    expect(one[0].path).toContain('KLI-POST.text[')
    const many = slopValidatorFindings('Ponadto, eksperci są zgodni. Podsumowując, w dzisiejszych czasach to działa.')
    expect(many.length).toBeGreaterThanOrEqual(3)
    expect(many.every((finding) => finding.severity === 'major')).toBe(true)
  })
})

describe('deslop — the agents carry the skill', () => {
  it('the author writes under the profile with deslop underneath; the editor runs detect mode', () => {
    const [author, editor] = postAgents
    expect(author.systemPrompt).toContain(DESLOP_WRITE_UNDER_PROFILE)
    expect(author.systemPrompt).toContain(DESLOP_PROSE_RULES)
    expect(author.systemPrompt).toContain('style_hygiene')
    expect(editor.systemPrompt).toContain(DESLOP_DETECT_FOR_EDITOR)
    expect(editor.systemPrompt).toContain('slop_pattern')
  })

  it('keeps the precedence the skill sets: the profile wins on style, rule 4 holds under any profile', () => {
    expect(DESLOP_WRITE_UNDER_PROFILE).toMatch(/profile wins on every stylistic choice/)
    expect(DESLOP_WRITE_UNDER_PROFILE).toMatch(/never invent\) holds under any profile/)
    expect(DESLOP_PROSE_RULES).toMatch(/never add a number or an example/)
  })
})

describe('publication adapter catalog', () => {
  it('resolves the platforms the order form can name, aliases included', () => {
    expect(adapterFor('LinkedIn')?.max_text_length).toBe(3000)
    expect(adapterFor('Facebook')?.max_text_length).toBe(63206)
    expect(adapterFor('Instagram')?.max_text_length).toBe(2200)
    expect(adapterFor('Twitter/X')?.adapter_id).toBe('x-post-text')
    expect(adapterFor('X')?.max_text_length).toBe(280)
    expect(adapterFor('Threads')?.max_text_length).toBe(500)
    expect(adapterFor('TikTok')?.max_text_length).toBe(4000)
    expect(adapterFor('Mastodon')).toBeNull()
  })
})
