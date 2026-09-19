/**
 * The versioned publication adapter catalog (STD-LIMITY: "limit jest parametrem
 * adaptera, nie zapamiętaną liczbą modelu"). A platform missing here has no
 * adapter: the post instruction carries `platform_limit_status: unknown` and the
 * publication configuration is `not_ready`. Nothing in this lane sends anything;
 * the catalog only describes what an adapter WOULD enforce. Limits are the
 * platforms' published text caps as of 2026-09 (Facebook 63 206, Instagram
 * caption 2 200, X 280 for non-premium accounts, Threads 500, TikTok caption
 * 4 000); bump `adapter_version` when one changes.
 */

export type PublicationAdapter = {
  platform: string
  adapter_id: string
  adapter_version: string
  format: 'text'
  max_text_length: number
  length_unit: 'characters'
  can_publish_text: 'true' | 'false' | 'unknown'
  can_read_result: 'true' | 'false' | 'unknown'
  mention_controls: string
}

export const publicationAdapters: Record<string, PublicationAdapter> = {
  linkedin: {
    platform: 'LinkedIn',
    adapter_id: 'linkedin-company-post-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 3000,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  facebook: {
    platform: 'Facebook',
    adapter_id: 'facebook-page-post-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 63206,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  instagram: {
    platform: 'Instagram',
    adapter_id: 'instagram-caption-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 2200,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  x: {
    platform: 'X',
    adapter_id: 'x-post-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 280,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  threads: {
    platform: 'Threads',
    adapter_id: 'threads-post-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 500,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  tiktok: {
    platform: 'TikTok',
    adapter_id: 'tiktok-caption-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 4000,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
  discord: {
    platform: 'Discord',
    adapter_id: 'discord-channel-message-text',
    adapter_version: '0.1.0',
    format: 'text',
    max_text_length: 2000,
    length_unit: 'characters',
    can_publish_text: 'unknown',
    can_read_result: 'unknown',
    mention_controls: 'mentions disabled unless explicitly approved',
  },
}

/** Order-form spellings that name a catalog entry under another key. */
const PLATFORM_ALIASES: Record<string, string> = { twitter: 'x', twitterx: 'x', xtwitter: 'x', xformerlytwitter: 'x', meta: 'facebook', fb: 'facebook', ig: 'instagram' }

/** Resolves the adapter for a platform name as the order form spells it (case/spacing tolerant); null when unsupported. */
export function adapterFor(platform: string | null | undefined): PublicationAdapter | null {
  if (!platform) return null
  const key = platform.trim().toLowerCase().replace(/[^a-z]/g, '')
  return publicationAdapters[PLATFORM_ALIASES[key] ?? key] ?? null
}
