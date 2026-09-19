import {
  tovBatchAnalystInputSchema, tovBatchAnalystResult,
  tovProfileSynthesizerInputSchema, tovProfileSynthesizerResult,
  tovBrandSynthesizerInputSchema, tovBrandSynthesizerResult,
} from '../../../../agency_tov/data/validators'

export const TOV_CORRECTION_TEXT = 'Please address the reader directly as you. Keep the strategy and all other tone-of-voice rules unchanged. This is a correction, not approval.'

export function resolveTovIntelligence(formatName: string, raw: unknown): unknown | undefined {
  if (formatName === 'agency_tov_batch_analyst') {
    const input = tovBatchAnalystInputSchema.parse(raw)
    const first = input.posts[0]
    const quote = first.text.slice(0, 160)
    return tovBatchAnalystResult.parse({ kind: 'research', data: {
      language: { primary: input.outputLanguage, notes: 'Fixture observation of the supplied corpus only.' },
      register: { formality: 3, warmth: 3, confidence: 3, humor: 1, technicality: 3, summary: 'Bounded fixture interpretation; live voice quality unproved.' },
      pointOfView: 'Describe the supplied source, not new customer decisions.',
      rhythm: { typicalPostLength: 'mixed', sentenceLength: 'Varies in the supplied corpus.', paragraphing: 'Preserve readable paragraphs.', listsAndLineBreaks: 'Use when the argument needs them.' },
      hooks: { patterns: ['Source-led opening'], examples: [first.text.split('\n')[0].slice(0, 160)] },
      structures: ['Observation, explanation, bounded next step'], closers: { patterns: ['Invitation'], ctaStyle: 'No promised business result.' },
      vocabulary: { signaturePhrases: [], favouredWords: [], avoided: ['Guaranteed results'], jargonLevel: 'Explain specialist language.' },
      formatting: { emoji: 'Optional', hashtags: 'Only source-relevant', mentions: 'No new names', links: 'Only supplied references', capsAndPunctuation: 'Plain punctuation' },
      themes: { topics: ['Supplied company material'], stances: [], values: [] },
      engagementInsights: ['Fixture does not infer causal effectiveness.'], doList: ['Keep claims within source evidence.'], dontList: ['Invent guarantees.'],
      exemplars: [{ postId: first.id, quote, whyTypical: 'Exact excerpt from the actual input batch.' }], confidence: 0.4,
    } })
  }
  if (formatName === 'agency_tov_profile_synthesizer') {
    const input = tovProfileSynthesizerInputSchema.parse(raw)
    const observation = input.observations[0].observation
    return tovProfileSynthesizerResult.parse({ kind: 'research', data: {
      ...observation, summary: 'Fixture synthesis of native batch observations.',
      voicePillars: [{ name: 'Source-grounded', description: 'Keep claims bounded by the supplied corpus.', evidence: observation.exemplars.map((item) => item.quote) }],
      evolution: 'No temporal trend inferred by fixture.', postSkeletons: observation.structures,
      exemplars: input.observations.flatMap((item) => item.observation.exemplars),
    } })
  }
  if (formatName === 'agency_tov_brand_synthesizer') {
    const input = tovBrandSynthesizerInputSchema.parse(raw)
    if (input.correction) {
      if (input.correction.instructions !== TOV_CORRECTION_TEXT || input.correction.affectedFields.length !== 1
        || input.correction.affectedFields[0] !== 'addressingTheReader') throw new Error('The correction fixture requires the registered client request and exact specialist field')
      return tovBrandSynthesizerResult.parse({ kind: 'research', data: {
        ...input.correction.previous, addressingTheReader: 'Address the reader directly as you.',
      } })
    }
    const { voice } = input.profiles[0]
    return tovBrandSynthesizerResult.parse({ kind: 'research', data: {
      brand: input.brand, summary: 'Fixture synthesis of actual native profile observations.',
      positioning: 'Source-grounded communication, without business guarantees.', personality: 'Clear and evidence-conscious.',
      voicePillars: voice.voicePillars.map((pillar) => ({ name: pillar.name, description: pillar.description, doThis: 'Use supplied evidence.', notThat: 'Invent additional authority.' })),
      sharedTraits: voice.doList, tensions: ['Fixture does not infer unobserved differences.'], register: voice.register,
      addressingTheReader: voice.pointOfView, emotions: 'Calm.', boundaries: voice.dontList,
      languagePolicy: input.outputLanguage, vocabulary: voice.vocabulary,
      postFormats: [{ name: 'Explanation', whenToUse: 'A source-grounded explanation.', skeleton: voice.postSkeletons.join('\n') || 'Observation, explanation.' }],
      hooks: voice.hooks, closers: voice.closers, formatting: voice.formatting,
      personaVariants: input.profiles.map(({ profile }) => ({ profileUrl: profile.profileUrl, displayName: profile.displayName,
        howTheyDiffer: 'No additional difference inferred.', whenToWriteAsThem: 'Only with their explicit authorization.' })),
      doList: voice.doList, dontList: voice.dontList,
      exemplars: input.profiles.flatMap(({ profile, voice: profileVoice }) => profileVoice.exemplars.map((item) => ({
        postId: item.postId, profileUrl: profile.profileUrl, quote: item.quote, whyItWorks: item.whyTypical,
      }))),
      counterExamples: [{ rule: 'No guarantees.', wrong: 'Results are guaranteed.', right: 'This is a proposed approach.' }],
      qaChecklist: ['Are factual claims supported by the supplied evidence?', 'Does the draft avoid invented guarantees?'], confidence: 0.4,
    } })
  }
  return undefined
}
