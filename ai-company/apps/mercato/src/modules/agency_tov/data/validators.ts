import { z } from 'zod'

/**
 * Tone-of-voice (ToV) research — shared shapes.
 *
 * List and quote lengths are stated in the prompts as targets, not enforced here:
 * providers do not honour JSON-schema `maxItems`/`maxLength`, so a hard `.max()`
 * would reject an otherwise good answer for one extra bullet.
 *
 * The corpus (LinkedIn posts scraped with Apify) is never handed to a model whole:
 * `lib/tov/pipeline.ts` runs a map → reduce over it. Every agent below is a
 * RESEARCHER (`{ kind: 'research', data }`): it reads a bounded slice of evidence and
 * returns typed observations; the pipeline (plain code) does the batching, the
 * bookkeeping and the merge order. Nothing here proposes or writes.
 */

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export const tovPostMediaKinds = ['none', 'image', 'video', 'article', 'document', 'poll', 'newsletter'] as const
export type TovPostMediaKind = (typeof tovPostMediaKinds)[number]

/** Where a post was scraped from. One voice profile is built per (source, profileUrl). */
export const tovSources = ['linkedin', 'x', 'facebook', 'instagram', 'website', 'youtube', 'other'] as const
export type TovSource = (typeof tovSources)[number]

/** One normalised post — the only fields a voice analysis needs. */
export const tovPostSchema = z.object({
  id: z.string().min(1),
  source: z.enum(tovSources),
  /** Stable author/channel key (the scraped profile, page or site URL); the display name is derived per profile. */
  profileUrl: z.string().min(1),
  authorName: z.string().min(1),
  url: z.string().min(1),
  postedAt: z.string().min(1),
  text: z.string().min(1),
  likes: z.number().int().min(0),
  comments: z.number().int().min(0),
  shares: z.number().int().min(0),
  media: z.enum(tovPostMediaKinds),
})
export type TovPost = z.infer<typeof tovPostSchema>

export const tovProfileMetaSchema = z.object({
  source: z.enum(tovSources),
  profileUrl: z.string().min(1),
  displayName: z.string().min(1),
  postCount: z.number().int().min(0),
  firstPostedAt: z.string().nullable(),
  lastPostedAt: z.string().nullable(),
})
export type TovProfileMeta = z.infer<typeof tovProfileMetaSchema>

export const tovOutputLanguages = ['en', 'pl'] as const
export type TovOutputLanguage = (typeof tovOutputLanguages)[number]

// ---------------------------------------------------------------------------
// Building blocks shared by the three result schemas
// ---------------------------------------------------------------------------

const dial = z.number().int().min(1).max(5)

/** Five 1–5 dials plus a sentence — comparable across batches, profiles and the brand. */
export const tovRegisterSchema = z.object({
  formality: dial,
  warmth: dial,
  confidence: dial,
  humor: dial,
  technicality: dial,
  summary: z.string().min(1),
})

export const tovRhythmSchema = z.object({
  typicalPostLength: z.enum(['short', 'medium', 'long', 'mixed']),
  sentenceLength: z.string().min(1),
  paragraphing: z.string().min(1),
  listsAndLineBreaks: z.string().min(1),
})

export const tovHooksSchema = z.object({
  patterns: z.array(z.string().min(1)),
  /** Verbatim first lines, ≤160 chars each, in the source language. */
  examples: z.array(z.string().min(1)),
})

export const tovClosersSchema = z.object({
  patterns: z.array(z.string().min(1)),
  ctaStyle: z.string().min(1),
})

export const tovVocabularySchema = z.object({
  signaturePhrases: z.array(z.string().min(1)),
  favouredWords: z.array(z.string().min(1)),
  avoided: z.array(z.string().min(1)),
  jargonLevel: z.string().min(1),
})

export const tovFormattingSchema = z.object({
  emoji: z.string().min(1),
  hashtags: z.string().min(1),
  mentions: z.string().min(1),
  links: z.string().min(1),
  capsAndPunctuation: z.string().min(1),
})

export const tovThemesSchema = z.object({
  topics: z.array(z.string().min(1)),
  stances: z.array(z.string().min(1)),
  values: z.array(z.string().min(1)),
})

export const tovLanguageSchema = z.object({
  primary: z.enum(['pl', 'en', 'mixed', 'other']),
  notes: z.string().min(1),
})

/** A quoted post the agent points at as typical. `postId` must come from the input. */
export const tovExemplarSchema = z.object({
  postId: z.string().min(1),
  quote: z.string().min(1),
  whyTypical: z.string().min(1),
})

const confidence = z.number().min(0).max(1)

// ---------------------------------------------------------------------------
// Agent 1 — batch analyst (map step)
// ---------------------------------------------------------------------------

export const tovBatchAnalystInputSchema = z.object({
  profile: tovProfileMetaSchema,
  batch: z.object({ index: z.number().int().min(0), total: z.number().int().min(1) }),
  outputLanguage: z.enum(tovOutputLanguages),
  posts: z
    .array(
      z.object({
        id: z.string(),
        postedAt: z.string(),
        media: z.enum(tovPostMediaKinds),
        likes: z.number(),
        comments: z.number(),
        shares: z.number(),
        text: z.string(),
      }),
    )
    .min(1),
})
export type TovBatchAnalystInput = z.infer<typeof tovBatchAnalystInputSchema>

export const tovBatchObservationSchema = z.object({
  language: tovLanguageSchema,
  register: tovRegisterSchema,
  pointOfView: z.string().min(1),
  rhythm: tovRhythmSchema,
  hooks: tovHooksSchema,
  structures: z.array(z.string().min(1)),
  closers: tovClosersSchema,
  vocabulary: tovVocabularySchema,
  formatting: tovFormattingSchema,
  themes: tovThemesSchema,
  engagementInsights: z.array(z.string().min(1)),
  doList: z.array(z.string().min(1)),
  dontList: z.array(z.string().min(1)),
  exemplars: z.array(tovExemplarSchema),
  confidence,
})
export type TovBatchObservation = z.infer<typeof tovBatchObservationSchema>

export const tovBatchAnalystResult = z.object({
  kind: z.literal('research'),
  data: tovBatchObservationSchema,
})
export type TovBatchAnalystResult = z.infer<typeof tovBatchAnalystResult>

// ---------------------------------------------------------------------------
// Agent 2 — profile synthesizer (reduce per author)
// ---------------------------------------------------------------------------

export const tovProfileSynthesizerInputSchema = z.object({
  profile: tovProfileMetaSchema,
  outputLanguage: z.enum(tovOutputLanguages),
  observations: z
    .array(
      z.object({
        batchIndex: z.number().int().min(0),
        dateRange: z.object({ from: z.string(), to: z.string() }),
        postCount: z.number().int().min(1),
        observation: tovBatchObservationSchema,
      }),
    )
    .min(1),
})
export type TovProfileSynthesizerInput = z.infer<typeof tovProfileSynthesizerInputSchema>

export const tovVoicePillarSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  evidence: z.array(z.string().min(1)),
})

export const tovProfileVoiceSchema = z.object({
  summary: z.string().min(1),
  voicePillars: z.array(tovVoicePillarSchema).min(1),
  language: tovLanguageSchema,
  register: tovRegisterSchema,
  pointOfView: z.string().min(1),
  rhythm: tovRhythmSchema,
  hooks: tovHooksSchema,
  structures: z.array(z.string().min(1)),
  closers: tovClosersSchema,
  vocabulary: tovVocabularySchema,
  formatting: tovFormattingSchema,
  themes: tovThemesSchema,
  /** How the voice moved across the observed date range. */
  evolution: z.string().min(1),
  engagementInsights: z.array(z.string().min(1)),
  doList: z.array(z.string().min(1)),
  dontList: z.array(z.string().min(1)),
  exemplars: z.array(tovExemplarSchema),
  /** Reusable post skeletons ("hook → story → lesson → question"), ≤3. */
  postSkeletons: z.array(z.string().min(1)),
  confidence,
})
export type TovProfileVoice = z.infer<typeof tovProfileVoiceSchema>

export const tovProfileSynthesizerResult = z.object({
  kind: z.literal('research'),
  data: tovProfileVoiceSchema,
})
export type TovProfileSynthesizerResult = z.infer<typeof tovProfileSynthesizerResult>

// ---------------------------------------------------------------------------
// Agent 3 — brand synthesizer (reduce across authors → KLI-TOV)
// ---------------------------------------------------------------------------

export const tovBrandSynthesizerInputSchema = z.object({
  brand: z.string().min(1),
  outputLanguage: z.enum(tovOutputLanguages),
  profiles: z
    .array(
      z.object({
        profile: tovProfileMetaSchema,
        voice: tovProfileVoiceSchema,
      }),
    )
    .min(1),
})
export type TovBrandSynthesizerInput = z.infer<typeof tovBrandSynthesizerInputSchema>

export const tovBrandPillarSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  doThis: z.string().min(1),
  notThat: z.string().min(1),
})

export const tovPostFormatSchema = z.object({
  name: z.string().min(1),
  whenToUse: z.string().min(1),
  skeleton: z.string().min(1),
})

export const tovPersonaVariantSchema = z.object({
  profileUrl: z.string().min(1),
  displayName: z.string().min(1),
  howTheyDiffer: z.string().min(1),
  whenToWriteAsThem: z.string().min(1),
})

export const tovBrandExemplarSchema = z.object({
  postId: z.string().min(1),
  profileUrl: z.string().min(1),
  quote: z.string().min(1),
  whyItWorks: z.string().min(1),
})

/** "Niewskazany" vs "zalecany" example for one rule (F22-1 AC 2). */
export const tovCounterExampleSchema = z.object({
  rule: z.string().min(1),
  wrong: z.string().min(1),
  right: z.string().min(1),
})

/**
 * KLI-TOV content. Field set follows user story F22-1 AC 2: tone, personality,
 * vocabulary, formality, how the reader is addressed, emotions, communication
 * boundaries, recommended and not-recommended examples.
 */
export const tovBrandVoiceSchema = z.object({
  brand: z.string().min(1),
  summary: z.string().min(1),
  positioning: z.string().min(1),
  /** Personality in a few sentences — who is speaking, as a character. */
  personality: z.string().min(1),
  voicePillars: z.array(tovBrandPillarSchema).min(1),
  sharedTraits: z.array(z.string().min(1)),
  /** Where the people genuinely differ — a brand ToV must not paper over them. */
  tensions: z.array(z.string().min(1)),
  register: tovRegisterSchema,
  /** Forms of address: "you"/"Ty"/"Państwo", first person singular vs plural, etc. */
  addressingTheReader: z.string().min(1),
  /** Emotional range the brand allows itself (and what it never does). */
  emotions: z.string().min(1),
  /** Hard limits: topics, tones and devices the brand never uses. */
  boundaries: z.array(z.string().min(1)),
  languagePolicy: z.string().min(1),
  vocabulary: tovVocabularySchema,
  postFormats: z.array(tovPostFormatSchema).min(1),
  hooks: tovHooksSchema,
  closers: tovClosersSchema,
  formatting: tovFormattingSchema,
  personaVariants: z.array(tovPersonaVariantSchema),
  doList: z.array(z.string().min(1)),
  dontList: z.array(z.string().min(1)),
  exemplars: z.array(tovBrandExemplarSchema),
  counterExamples: z.array(tovCounterExampleSchema).min(1),
  /** Checks a QA agent (or a human) runs against a draft written in this voice. */
  qaChecklist: z.array(z.string().min(1)),
  confidence,
})
export type TovBrandVoice = z.infer<typeof tovBrandVoiceSchema>

export const tovBrandSynthesizerResult = z.object({
  kind: z.literal('research'),
  data: tovBrandVoiceSchema,
})
export type TovBrandSynthesizerResult = z.infer<typeof tovBrandSynthesizerResult>

// ---------------------------------------------------------------------------
// Agent 0 — source scout (optional, web-enabled): where does this brand publish?
// ---------------------------------------------------------------------------

export const tovSourceScoutInputSchema = z.object({
  brand: z.string().min(1),
  /** Public identifiers only (names, known profile URLs, website) — never client data. */
  people: z.array(z.object({ name: z.string().min(1), knownUrls: z.array(z.string()).max(10) })),
  websiteUrl: z.string().nullable(),
  outputLanguage: z.enum(tovOutputLanguages),
})
export type TovSourceScoutInput = z.infer<typeof tovSourceScoutInputSchema>

export const tovDiscoveredTargetSchema = z.object({
  source: z.enum(tovSources),
  url: z.string().min(1),
  /** Which person or the brand itself this channel belongs to. */
  owner: z.string().min(1),
  /** What kind of material lives there (posts, blog, podcast notes, talks…). */
  material: z.string().min(1),
  confidence: z.number().min(0),
  evidenceUrl: z.string().min(1),
})

export const tovSourceScoutResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    targets: z.array(tovDiscoveredTargetSchema),
    notes: z.string().min(1),
  }),
})
export type TovSourceScoutResult = z.infer<typeof tovSourceScoutResult>

// ---------------------------------------------------------------------------
// Persistence — what a stored document version says about its evidence
// ---------------------------------------------------------------------------

/** `KLI-TOV` is the brand document (F22-1); `TOV-PROFILE` is the per-author appendix behind it. */
export const tovDocumentKinds = ['KLI-TOV', 'TOV-PROFILE'] as const
export type TovDocumentKind = (typeof tovDocumentKinds)[number]

export const tovResearchRunStatuses = ['running', 'done', 'failed'] as const
export type TovResearchRunStatus = (typeof tovResearchRunStatuses)[number]

/**
 * One quoted thing in a document version, resolved to the stored post it came
 * from. `path` is where in the body it sits (`exemplars[2]`, `hooks.examples[0]`);
 * `postRowId` is `agency_tov_posts.id`, `postId` the platform id the agent cited.
 */
export const tovCitationSchema = z.object({
  path: z.string().min(1),
  postId: z.string().min(1),
  postRowId: z.string().min(1),
  profileUrl: z.string().min(1),
  url: z.string().min(1),
  quote: z.string().min(1),
})
export type TovCitation = z.infer<typeof tovCitationSchema>
