import { limits } from '../../../data/templates'
import { channelSelectorResult, peopleFinderResult, type ChannelSelectorInput, type PeopleFinderInput } from '../../../data/agents/people'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import { RESEARCH_CHANNEL_SELECTOR_AGENT_ID, RESEARCH_PEOPLE_FINDER_AGENT_ID } from '../../agents/ids.people'
import { stripBoilerplate, type CollectedSource, type FetchPage, type FetchedPage, type SocialPost } from '../fetch'
import type { SearchHit, SearchWeb } from '../firecrawl'
import { sourceId } from '../ids'
import type { GateIssue } from '../gate'
import type { StepFn } from '../pipeline'
import { canonicalUrl } from '../ids'
import { normalizeForMatch } from '../util'

/**
 * 3.2a — the people who speak for the brand, and what they say elsewhere.
 * Code finds candidates in what was already read (plus the client's own list),
 * one agent names them from verbatim evidence, code searches the web for each,
 * one agent picks the real channels among real hits, and code scrapes their own
 * posts and fetches the pages where they are quoted. Everything becomes ordinary
 * sources of the register — the same readers extract facts and language samples
 * from them, so the tone-of-voice writer hears the founders, not only the site.
 * Caps are STD-LIMITY's `people*` settings; every search hit is vetted; a URL the
 * selector did not get from a hit is dropped.
 */

export type KnownPerson = { name: string; role: string | null; provided_by: 'client' | 'contact'; knownUrls: string[] }

export type ScrapeProfilePosts = (input: { url: string; platform: string; maxPosts: number }) => Promise<SocialPost[]>

export type PeopleDiscoveryOptions = {
  order: OrderFacts
  /** The client's sources already collected (website pages, the official profile); people are named from these. */
  collected: CollectedSource[]
  knownPeople: KnownPerson[]
  searchWeb?: SearchWeb
  fetchPage: FetchPage
  scrapeProfilePosts?: ScrapeProfilePosts
  step: StepFn
  now?: () => Date
  log?: (message: string) => void
}

export type DiscoveredPerson = {
  name: string
  role: string
  why: string
  confidence: number
  evidence_source_id: string | null
  provided_by: 'client' | 'contact' | 'pages'
  own_channels: Array<{ url: string; platform: string; posts: number; source_ids: string[] }>
  mentions: Array<{ url: string; kind: string; source_id: string | null }>
}

export type PeopleDiscoveryResult = {
  people: DiscoveredPerson[]
  sources: CollectedSource[]
  issues: GateIssue[]
  stats: { candidates: number; followed: number; searches: number; hits: number; scraped_posts: number; fetched_pages: number }
}

const issue = (code: string, path: string, detail: string, severity = 'repaired'): GateIssue => ({ code, severity, detail, path })

/** People-search directories and profile mirrors: never a channel, never a mention. */
const NOISE_HOSTS = /(^|\.)(rocketreach|zoominfo|apollo|lusha|signalhire|contactout|crunchbase|pitchbook|spokeo|whitepages|goldenline|pracuj|indeed|glassdoor|aleo|krs-online|rejestr\.io|ceidg|panoramafirm|firmy\.net)\./i
const SCRAPABLE = new Set(['linkedin', 'x', 'facebook', 'instagram'])

const hostOf = (url: string): string => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }

/** Search queries are code: the name with the brand, the name with the platform, the name with the words an interview carries. */
export function personQueries(name: string, order: OrderFacts): string[] {
  const interview = order.language.toLowerCase().startsWith('pl') ? 'wywiad OR podcast OR rozmowa' : 'interview OR podcast OR talk'
  return [`"${name}" ${order.brand}`, `"${name}" linkedin`, `"${name}" ${interview}`].slice(0, limits.research.personSearchQueries)
}

/** Keeps one hit per url, drops directories and the client's own site (already read). */
export function vetPersonHits(hits: Array<SearchHit & { query: string }>, clientUrl: string): Array<SearchHit & { query: string }> {
  const clientHost = hostOf(clientUrl)
  const seen = new Set<string>()
  const kept: Array<SearchHit & { query: string }> = []
  for (const hit of hits) {
    const host = hostOf(hit.url)
    const key = canonicalUrl(hit.url)
    if (!host || host === clientHost || NOISE_HOSTS.test(host) || seen.has(key)) continue
    seen.add(key)
    kept.push(hit)
  }
  return kept
}

type Finder = ReturnType<typeof peopleFinderResult.parse>['data']
type Selection = ReturnType<typeof channelSelectorResult.parse>['data']

/** Every named person must be quoted verbatim from a stored page, or be one the client gave. */
export function gatePeople(data: Finder, pages: PeopleFinderInput['pages'], known: KnownPerson[], max: number) {
  const issues: GateIssue[] = []
  const byId = new Map(pages.map((page) => [page.source_id, normalizeForMatch(page.excerpt)]))
  const knownNames = new Set(known.map((person) => normalizeForMatch(person.name)))
  const seen = new Set<string>()
  const people = data.people.flatMap((person, index) => {
    const key = normalizeForMatch(person.name)
    if (seen.has(key)) { issues.push(issue('DUPLICATE_PERSON', `people[${index}]`, `${person.name} listed twice`, 'dropped')); return [] }
    const provided = knownNames.has(key)
    const excerpt = person.source_id ? byId.get(person.source_id) : undefined
    const quoted = excerpt !== undefined && excerpt.includes(normalizeForMatch(person.evidence_quote)) && excerpt.includes(key)
    if (!provided && !quoted) {
      issues.push(issue('PERSON_NOT_IN_PAGES', `people[${index}]`, `${person.name}: the evidence quote (or the name) is not verbatim in ${person.source_id ?? 'any page'}`, 'dropped'))
      return []
    }
    seen.add(key)
    return [{ ...person, confidence: provided ? 1 : person.confidence }]
  })
  for (const person of known) {
    if (!seen.has(normalizeForMatch(person.name))) {
      seen.add(normalizeForMatch(person.name))
      people.push({ name: person.name, role: person.role ?? 'unknown role', why: 'wskazana przez klienta na zamówieniu', evidence_quote: 'provided by client', source_id: null, confidence: 1 })
    }
  }
  const ordered = people.sort((a, b) => b.confidence - a.confidence)
  if (ordered.length > max) issues.push(issue('LIMIT_TRUNCATED', 'people', `${ordered.length} people; STD-LIMITY follows ${max}`))
  const value = { people: ordered.slice(0, max), notes: data.notes }
  return { value, issues, kept: value.people.length, dropped: data.people.length - people.length }
}

/** Every url the selector returns must be one of the hits it was given. */
export function gateChannels(data: Selection, hits: ChannelSelectorInput['hits']) {
  const issues: GateIssue[] = []
  const hitUrls = new Map(hits.map((hit) => [canonicalUrl(hit.url), hit.url]))
  const own = data.own_channels.flatMap((channel, index) => {
    const url = hitUrls.get(canonicalUrl(channel.url))
    if (!url) { issues.push(issue('URL_NOT_FROM_SEARCH', `own_channels[${index}]`, `${channel.url} is not a search result`, 'dropped')); return [] }
    return [{ ...channel, url }]
  })
  const mentions = data.mentions.flatMap((mention, index) => {
    const url = hitUrls.get(canonicalUrl(mention.url))
    if (!url) { issues.push(issue('URL_NOT_FROM_SEARCH', `mentions[${index}]`, `${mention.url} is not a search result`, 'dropped')); return [] }
    return [{ ...mention, url }]
  })
  const value = { own_channels: own, mentions, not_this_person: data.not_this_person }
  return { value, issues, kept: own.length + mentions.length, dropped: data.own_channels.length + data.mentions.length - own.length - mentions.length }
}

export async function discoverPeople(opts: PeopleDiscoveryOptions): Promise<PeopleDiscoveryResult> {
  const log = opts.log ?? (() => {})
  const now = opts.now ?? (() => new Date())
  const issues: GateIssue[] = []
  const sources: CollectedSource[] = []
  const stats = { candidates: 0, followed: 0, searches: 0, hits: 0, scraped_posts: 0, fetched_pages: 0 }
  const lang = opts.order.outputLanguage
  const orderCtx = { brand: opts.order.brand, market: opts.order.market, language: opts.order.language, websiteUrl: opts.order.websiteUrl }
  let nextIndex = opts.collected.length
  let totalChars = opts.collected.reduce((sum, source) => sum + (source.text?.length ?? 0), 0)

  const add = (page: FetchedPage, args: { publisher: string; kind: string; channel: string; published_at?: string | null; readScope?: string }): CollectedSource => {
    const cleaned = page.markdown ? stripBoilerplate(page.markdown) : null
    let text = cleaned && cleaned.length > 0 ? cleaned : null
    let access: CollectedSource['access'] = text ? 'full' : 'unavailable'
    if (text && totalChars + text.length > limits.research.maxTotalChars) {
      const room = Math.max(0, limits.research.maxTotalChars - totalChars)
      text = room > 500 ? text.slice(0, room) : null
      access = text ? 'partial' : 'unavailable'
    }
    if (text) totalChars += text.length
    const source: CollectedSource = {
      source_id: sourceId(nextIndex++),
      url: page.finalUrl || page.url,
      publisher: args.publisher,
      kind: args.kind,
      channel: args.channel,
      origin: 'agent',
      access,
      title: page.title,
      text,
      bytes: text?.length ?? 0,
      retrieved_at: now().toISOString(),
      published_at: args.published_at ?? null,
      read_scope: args.readScope ?? (text ? `${text.length} chars read after boilerplate removal` : 'not readable'),
      limitation: access === 'unavailable' ? (page.error ?? 'page not readable') : access === 'partial' ? 'truncated by the order text cap' : null,
    }
    sources.push(source)
    log(`${source.source_id} ${access} ${source.url} — ${args.publisher}`)
    return source
  }

  // 3.2a-1 — who speaks for the brand: the client's list plus what the stored pages say.
  const pages: PeopleFinderInput['pages'] = opts.collected
    .filter((source) => source.text && source.origin !== 'corpus')
    .slice(0, limits.research.clientWebPagesMax)
    .map((source) => ({ source_id: source.source_id, url: source.url, publisher: source.publisher, excerpt: source.text!.slice(0, 6000) }))
  const known = opts.knownPeople.map((person) => ({ name: person.name, role: person.role, provided_by: person.provided_by }))
  const finder = pages.length || known.length
    ? await opts.step<Finder>({
        step: '3.2a',
        agentId: RESEARCH_PEOPLE_FINDER_AGENT_ID,
        label: 'people',
        input: { order: orderCtx, outputLanguage: lang, pages, known_people: known } satisfies PeopleFinderInput,
        parse: (raw) => peopleFinderResult.parse(raw).data,
        gate: (data) => gatePeople(data, pages, opts.knownPeople, limits.research.peopleMax),
      })
    : { value: { people: [], notes: '' }, issues: [] as GateIssue[] }
  issues.push(...finder.issues)
  stats.candidates = finder.value.people.length
  const people: DiscoveredPerson[] = finder.value.people.map((person) => ({
    name: person.name,
    role: person.role,
    why: person.why,
    confidence: person.confidence,
    evidence_source_id: person.source_id,
    provided_by: opts.knownPeople.find((known) => normalizeForMatch(known.name) === normalizeForMatch(person.name))?.provided_by ?? 'pages',
    own_channels: [],
    mentions: [],
  }))
  if (!people.length) {
    issues.push({ code: 'NO_PEOPLE_FOUND', severity: 'limitation', detail: 'no person speaking for the brand was named on the stored pages or by the client; the voice rests on the website and the official profile alone', path: 'people' })
    return { people, sources, issues, stats }
  }

  // 3.2a-2 — where each of them publishes and is quoted: real search, vetted hits, an agent that only chooses.
  for (const person of people) {
    stats.followed += 1
    const knownUrls = opts.knownPeople.find((known) => normalizeForMatch(known.name) === normalizeForMatch(person.name))?.knownUrls ?? []
    const hits: Array<SearchHit & { query: string }> = knownUrls.map((url) => ({ query: 'provided by client', url, title: `${person.name} (provided by client)`, snippet: null }))
    if (opts.searchWeb) {
      for (const query of personQueries(person.name, opts.order)) {
        try {
          const found = await opts.searchWeb(query, { limit: limits.research.personSearchHits })
          stats.searches += 1
          hits.push(...found.map((hit) => ({ ...hit, query })))
          log(`search "${query}": ${found.length} hits`)
        } catch (error) {
          issues.push({ code: 'SEARCH_FAILED', severity: 'limitation', detail: `${person.name}: "${query}" — ${error instanceof Error ? error.message : String(error)}`, path: 'people' })
        }
      }
    }
    const vetted = vetPersonHits(hits, opts.order.websiteUrl)
    stats.hits += vetted.length
    if (!vetted.length) {
      issues.push({ code: 'NO_PERSON_HITS', severity: 'limitation', detail: `${person.name}: no usable search hits`, path: 'people' })
      continue
    }
    const selection = await opts.step<Selection>({
      step: '3.2a',
      agentId: RESEARCH_CHANNEL_SELECTOR_AGENT_ID,
      label: `channels:${person.name}`,
      input: { order: orderCtx, outputLanguage: lang, person: { name: person.name, role: person.role }, hits: vetted } satisfies ChannelSelectorInput,
      parse: (raw) => channelSelectorResult.parse(raw).data,
      gate: (data) => gateChannels(data, vetted),
    })
    issues.push(...selection.issues)

    // Own channels: posts of the person, scraped, the strongest first (STD-LIMITY personPostsTarget per person).
    let postsForPerson = 0
    for (const channel of [...selection.value.own_channels].sort((a, b) => b.confidence - a.confidence)) {
      if (postsForPerson >= limits.research.personPostsTarget) break
      if (SCRAPABLE.has(channel.platform) && opts.scrapeProfilePosts) {
        let posts: SocialPost[] = []
        try {
          posts = await opts.scrapeProfilePosts({ url: channel.url, platform: channel.platform, maxPosts: limits.research.personPostsTarget * 3 })
        } catch (error) {
          issues.push({ code: 'SCRAPE_FAILED', severity: 'limitation', detail: `${person.name} ${channel.url}: ${error instanceof Error ? error.message : String(error)}`, path: 'people' })
        }
        const top = posts
          .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares) || b.postedAt.localeCompare(a.postedAt))
          .slice(0, limits.research.personPostsTarget - postsForPerson)
        const ids: string[] = []
        for (const post of top) {
          const source = add(
            { url: post.url, finalUrl: post.url, status: 'ok', title: `${post.authorName} — post`, markdown: post.text, error: null },
            { publisher: person.name, kind: 'wpis osoby wypowiadającej się w imieniu marki', channel: channel.platform, published_at: post.postedAt, readScope: `${post.text.length} chars, whole post (${post.likes} likes, ${post.comments} comments)` },
          )
          ids.push(source.source_id)
        }
        postsForPerson += top.length
        stats.scraped_posts += top.length
        person.own_channels.push({ url: channel.url, platform: channel.platform, posts: top.length, source_ids: ids })
        if (!posts.length) issues.push({ code: 'CHANNEL_EMPTY', severity: 'limitation', detail: `${person.name}: nothing readable at ${channel.url}`, path: 'people' })
      } else if (channel.platform === 'website' || channel.platform === 'other') {
        const page = await opts.fetchPage(channel.url).catch((error): FetchedPage => ({ url: channel.url, finalUrl: channel.url, status: 'unavailable', title: null, markdown: null, error: error instanceof Error ? error.message : String(error) }))
        const source = add(page, { publisher: person.name, kind: 'kanał własny osoby wypowiadającej się w imieniu marki', channel: channel.platform })
        stats.fetched_pages += 1
        person.own_channels.push({ url: channel.url, platform: channel.platform, posts: source.text ? 1 : 0, source_ids: [source.source_id] })
      } else {
        person.own_channels.push({ url: channel.url, platform: channel.platform, posts: 0, source_ids: [] })
      }
    }

    // Mentions: what others let them say — interviews, articles, podcasts (STD-LIMITY personPagesMax per person).
    for (const mention of [...selection.value.mentions].sort((a, b) => b.confidence - a.confidence).slice(0, limits.research.personPagesMax)) {
      const page = await opts.fetchPage(mention.url).catch((error): FetchedPage => ({ url: mention.url, finalUrl: mention.url, status: 'unavailable', title: null, markdown: null, error: error instanceof Error ? error.message : String(error) }))
      const source = add(page, { publisher: `${person.name} — ${mention.kind} (${hostOf(mention.url)})`, kind: `wypowiedź osoby u strony trzeciej (${mention.kind})`, channel: 'WWW' })
      stats.fetched_pages += 1
      person.mentions.push({ url: mention.url, kind: mention.kind, source_id: source.text ? source.source_id : null })
    }
  }
  return { people, sources, issues, stats }
}
