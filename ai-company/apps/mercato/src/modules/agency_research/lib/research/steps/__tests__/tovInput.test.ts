import type { SpecialistTovDocument } from '@/modules/agency_tov/lib/documentVersion/contracts'
import { parseDownstreamTov, specialistTovInput, tovCopyChecks, tovForbiddenWording, tovInstructionRules, tovVoiceTraits } from '../tovInput'

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const body: SpecialistTovDocument['body'] = {
  brand: 'Acme', summary: 'Direct and useful.', positioning: 'Expert guide.', personality: 'Calm practitioner.',
  voicePillars: [{ name: 'Clarity', description: 'Say the useful thing first.', doThis: 'Lead with the answer.', notThat: 'Do not tease.' }],
  sharedTraits: ['clear'], tensions: [],
  register: { formality: 3, warmth: 4, confidence: 4, humor: 2, technicality: 3, summary: 'Plain expert language.' },
  addressingTheReader: 'Use direct second person.', emotions: 'Calm confidence.', boundaries: ['No hype.'], languagePolicy: 'Use Polish.',
  vocabulary: { signaturePhrases: ['Sprawdźmy'], favouredWords: ['konkretnie'], avoided: ['rewolucyjny'], jargonLevel: 'Explain terms.' },
  postFormats: [{ name: 'Guide', whenToUse: 'Teaching', skeleton: 'Problem → answer → next step' }],
  hooks: { patterns: ['Question'], examples: ['Co blokuje wynik?'] },
  closers: { patterns: ['Next step'], ctaStyle: 'Specific invitation.' },
  formatting: { emoji: 'Rare', hashtags: 'None', mentions: 'Only relevant', links: 'One useful link', capsAndPunctuation: 'Sentence case' },
  personaVariants: [], doList: ['Use concrete examples.'], dontList: ['Never overclaim.'],
  exemplars: [], counterExamples: [{ rule: 'Be direct', wrong: 'You will not believe this.', right: 'Here is the result.' }],
  qaChecklist: ['Is the claim specific?', 'Is the next step clear?'], confidence: 0.9,
}
const document: SpecialistTovDocument = { owner: 'agency_tov', kind: 'KLI-TOV', researchRunId: uuid(1), documentId: uuid(2),
  versionId: uuid(3), version: '2.0', brand: 'Acme', isCurrent: true, body, renderedMd: '# ToV', citations: [] }

test('pins and consumes the exact specialist body without creating a research ToV copy', () => {
  const input = specialistTovInput(document)
  expect(input).toMatchObject({ document_id: `agency_tov:${document.documentId}`, version: '2.0', versionId: document.versionId,
    specialistTov: { researchRunId: document.researchRunId, documentId: document.documentId, versionId: document.versionId } })
  expect(input.data).toBe(body)
  const parsed = parseDownstreamTov(input)
  expect(parsed).toEqual(body)
  expect(tovVoiceTraits(parsed)).toEqual(['Clarity: Say the useful thing first.'])
  expect(tovInstructionRules(parsed)).toEqual(['Lead with the answer.', 'Use concrete examples.'])
  expect(tovForbiddenWording(parsed)).toEqual(['rewolucyjny', 'Never overclaim.'])
  expect(tovCopyChecks(parsed)).toEqual(body.qaChecklist)
})
