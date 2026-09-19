import { z } from 'zod'

/**
 * 3.2a agent I/O — the people who speak for the brand. Discovery is code
 * (web search); the finder names people only from stored pages or the
 * client's own list, the selector chooses only among real search hits.
 * Nothing here invents a person, a URL or a channel.
 */

const outputLanguage = z.enum(['pl', 'en'])
const orderContext = z.object({ brand: z.string(), market: z.string(), language: z.string(), websiteUrl: z.string() })

export const peopleFinderInputSchema = z.object({
  order: orderContext,
  outputLanguage,
  /** Stored client pages, trimmed; names must appear verbatim in one of them (or in `known_people`). */
  pages: z.array(z.object({ source_id: z.string(), url: z.string(), publisher: z.string(), excerpt: z.string() })),
  /** People the client named on the order form (and the buyer contact); trusted as given. */
  known_people: z.array(z.object({ name: z.string(), role: z.string().nullable(), provided_by: z.enum(['client', 'contact']) })),
})
export type PeopleFinderInput = z.infer<typeof peopleFinderInputSchema>

export const peopleFinderResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    people: z.array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        why: z.string().min(1),
        /** Verbatim from the page (or `provided by client`) — the gate checks it. */
        evidence_quote: z.string().min(1),
        source_id: z.string().nullable(),
        confidence: z.number().min(0).max(1),
      }),
    ),
    notes: z.string(),
  }),
})

export const channelSelectorInputSchema = z.object({
  order: orderContext,
  outputLanguage,
  person: z.object({ name: z.string(), role: z.string() }),
  /** Real search results; every url the selector returns MUST be one of these. */
  hits: z.array(z.object({ query: z.string(), url: z.string(), title: z.string().nullable(), snippet: z.string().nullable() })),
})
export type ChannelSelectorInput = z.infer<typeof channelSelectorInputSchema>

export const channelPlatforms = ['linkedin', 'x', 'facebook', 'instagram', 'youtube', 'website', 'other'] as const
export const mentionKinds = ['interview', 'article', 'podcast', 'talk', 'other'] as const

export const channelSelectorResult = z.object({
  kind: z.literal('research'),
  data: z.object({
    /** Places where this person publishes in their own words. */
    own_channels: z.array(z.object({ url: z.string().min(1), platform: z.enum(channelPlatforms), why: z.string().min(1), confidence: z.number().min(0).max(1) })),
    /** Pages where this person is quoted or interviewed by someone else. */
    mentions: z.array(z.object({ url: z.string().min(1), kind: z.enum(mentionKinds), why: z.string().min(1), confidence: z.number().min(0).max(1) })),
    /** Hits that are a different person with the same name, or noise. */
    not_this_person: z.array(z.string()),
  }),
})
