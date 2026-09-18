import type { z } from 'zod'
import type { TovBrandVoice, TovPost, TovProfileVoice, TovProfileMeta, tovRegisterSchema } from '../../data/validators'
import type { TovPipelineResult } from './pipeline'

type Register = z.infer<typeof tovRegisterSchema>

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- —'
}

function dials(register: Register): string {
  const row = (label: string, v: number) => `| ${label} | ${'●'.repeat(v)}${'○'.repeat(5 - v)} ${v}/5 |`
  return [
    '| Dial | Value |',
    '|---|---|',
    row('Formality', register.formality),
    row('Warmth', register.warmth),
    row('Confidence', register.confidence),
    row('Humor', register.humor),
    row('Technicality', register.technicality),
    '',
    register.summary,
  ].join('\n')
}

/** Platform post id → the post's own URL, or null when the corpus is not at hand. */
export type TovLinkResolver = (postId: string) => string | null

export function linkResolverFor(posts: TovPost[]): TovLinkResolver {
  const byId = new Map(posts.map((post) => [post.id, post.url]))
  return (postId) => byId.get(postId) ?? null
}

/** A citation links to the post itself; without the corpus it can only point at the author's feed. */
function postLink(profileUrl: string, postId: string, linkOf?: TovLinkResolver): string {
  return linkOf?.(postId) ?? `${profileUrl.replace(/\/$/, '')}/recent-activity/all/ (post ${postId})`
}

/** Renders the KLI-TOV document from the brand synthesis. */
export function renderBrandTov(brand: TovBrandVoice, profiles: { profile: TovProfileMeta }[], linkOf?: TovLinkResolver): string {
  const nameOf = new Map(profiles.map((p) => [p.profile.profileUrl, p.profile.displayName]))
  return [
    `# Tone of voice — ${brand.brand}`,
    '',
    brand.summary,
    '',
    '## Positioning',
    brand.positioning,
    '',
    '## Personality',
    brand.personality,
    '',
    '## Voice pillars',
    ...brand.voicePillars.flatMap((p) => [
      `### ${p.name}`,
      p.description,
      '',
      `- **Do:** ${p.doThis}`,
      `- **Not:** ${p.notThat}`,
      '',
    ]),
    '## Register',
    dials(brand.register),
    '',
    '## Addressing the reader',
    brand.addressingTheReader,
    '',
    '## Emotions',
    brand.emotions,
    '',
    '## Boundaries',
    bullets(brand.boundaries),
    '',
    '## Language policy',
    brand.languagePolicy,
    '',
    '## Shared traits',
    bullets(brand.sharedTraits),
    '',
    '## Tensions between the voices',
    bullets(brand.tensions),
    '',
    '## Vocabulary',
    `- **Signature phrases:** ${brand.vocabulary.signaturePhrases.join(' · ') || '—'}`,
    `- **Favoured words:** ${brand.vocabulary.favouredWords.join(', ') || '—'}`,
    `- **Avoid:** ${brand.vocabulary.avoided.join(', ') || '—'}`,
    `- **Jargon level:** ${brand.vocabulary.jargonLevel}`,
    '',
    '## Post formats',
    ...brand.postFormats.flatMap((f) => [`### ${f.name}`, `_When:_ ${f.whenToUse}`, '', '```', f.skeleton, '```', '']),
    '## Hooks',
    bullets(brand.hooks.patterns),
    '',
    ...brand.hooks.examples.map((e) => `> ${e}`),
    '',
    '## Closers and calls to action',
    bullets(brand.closers.patterns),
    '',
    brand.closers.ctaStyle,
    '',
    '## Formatting',
    `- **Emoji:** ${brand.formatting.emoji}`,
    `- **Hashtags:** ${brand.formatting.hashtags}`,
    `- **Mentions:** ${brand.formatting.mentions}`,
    `- **Links:** ${brand.formatting.links}`,
    `- **Caps and punctuation:** ${brand.formatting.capsAndPunctuation}`,
    '',
    '## Do',
    bullets(brand.doList),
    '',
    "## Don't",
    bullets(brand.dontList),
    '',
    '## Recommended vs not recommended',
    ...brand.counterExamples.flatMap((c) => [`**${c.rule}**`, '', `- ❌ ${c.wrong}`, `- ✅ ${c.right}`, '']),
    '## Writing as a specific person',
    ...brand.personaVariants.flatMap((v) => [
      `### ${v.displayName}`,
      v.howTheyDiffer,
      '',
      `_When:_ ${v.whenToWriteAsThem}`,
      '',
    ]),
    '## Exemplars',
    ...brand.exemplars.flatMap((e) => [
      `> ${e.quote}`,
      `> — ${nameOf.get(e.profileUrl) ?? e.profileUrl}, ${postLink(e.profileUrl, e.postId, linkOf)}`,
      '',
      e.whyItWorks,
      '',
    ]),
    '## QA checklist',
    ...brand.qaChecklist.map((c) => `- [ ] ${c}`),
    '',
    `_Confidence: ${Math.round(brand.confidence * 100)}%._`,
    '',
  ].join('\n')
}

/** Per-author appendix — the evidence behind the brand document. */
export function renderProfileVoice(profile: TovProfileMeta, voice: TovProfileVoice, linkOf?: TovLinkResolver): string {
  return [
    `# Voice profile — ${profile.displayName}`,
    '',
    `${profile.postCount} posts, ${profile.firstPostedAt?.slice(0, 10) ?? '?'} → ${profile.lastPostedAt?.slice(0, 10) ?? '?'} · ${profile.profileUrl}`,
    '',
    voice.summary,
    '',
    '## Voice pillars',
    ...voice.voicePillars.flatMap((p) => [`### ${p.name}`, p.description, '', bullets(p.evidence), '']),
    '## Register',
    dials(voice.register),
    '',
    `**Point of view:** ${voice.pointOfView}`,
    '',
    '## Rhythm',
    `- **Typical length:** ${voice.rhythm.typicalPostLength}`,
    `- **Sentences:** ${voice.rhythm.sentenceLength}`,
    `- **Paragraphs:** ${voice.rhythm.paragraphing}`,
    `- **Lists / line breaks:** ${voice.rhythm.listsAndLineBreaks}`,
    '',
    '## Hooks',
    bullets(voice.hooks.patterns),
    '',
    ...voice.hooks.examples.map((e) => `> ${e}`),
    '',
    '## Structures',
    bullets(voice.structures),
    '',
    '## Post skeletons',
    ...voice.postSkeletons.flatMap((s) => ['```', s, '```', '']),
    '## Closers',
    bullets(voice.closers.patterns),
    '',
    voice.closers.ctaStyle,
    '',
    '## Vocabulary',
    `- **Signature phrases:** ${voice.vocabulary.signaturePhrases.join(' · ') || '—'}`,
    `- **Favoured words:** ${voice.vocabulary.favouredWords.join(', ') || '—'}`,
    `- **Avoided:** ${voice.vocabulary.avoided.join(', ') || '—'}`,
    `- **Jargon:** ${voice.vocabulary.jargonLevel}`,
    '',
    '## Themes',
    `- **Topics:** ${voice.themes.topics.join(', ') || '—'}`,
    `- **Stances:** ${voice.themes.stances.join('; ') || '—'}`,
    `- **Values:** ${voice.themes.values.join(', ') || '—'}`,
    '',
    '## Evolution',
    voice.evolution,
    '',
    '## What lands',
    bullets(voice.engagementInsights),
    '',
    '## Do',
    bullets(voice.doList),
    '',
    "## Don't",
    bullets(voice.dontList),
    '',
    '## Exemplars',
    ...voice.exemplars.flatMap((e) => [`> ${e.quote}`, `> — ${postLink(profile.profileUrl, e.postId, linkOf)}`, '', e.whyTypical, '']),
    `_Confidence: ${Math.round(voice.confidence * 100)}%._`,
    '',
  ].join('\n')
}

export function renderRunSummary(result: TovPipelineResult): string {
  const { stats } = result
  return [
    `Posts: ${stats.posts} · Profiles: ${stats.profiles} · Batches: ${stats.batches}`,
    `Agent calls: ${stats.agentCalls} · Cached steps reused: ${stats.cachedSteps}`,
    `Grounding gate: ${stats.ungroundedDropped} ungrounded evidence items dropped · ${stats.groundingRejections} results rejected and re-requested`,
    ...result.profiles.map(
      (p) => `- ${p.profile.displayName}: ${p.profile.postCount} posts in ${p.batches.length} batches, confidence ${Math.round(p.voice.confidence * 100)}%`,
    ),
  ].join('\n')
}
