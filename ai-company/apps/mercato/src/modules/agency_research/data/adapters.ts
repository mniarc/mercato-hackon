/**
 * The versioned publication adapter catalog (STD-LIMITY: "limit jest parametrem
 * adaptera, nie zapamiętaną liczbą modelu"). A platform missing here has no
 * adapter: the post instruction carries `platform_limit_status: unknown` and the
 * publication configuration is `not_ready`. Nothing in this lane sends anything;
 * the catalog only describes what an adapter WOULD enforce.
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

/** Resolves the adapter for a platform name as the order form spells it (case/spacing tolerant); null when unsupported. */
export function adapterFor(platform: string | null | undefined): PublicationAdapter | null {
  if (!platform) return null
  const key = platform.trim().toLowerCase().replace(/[^a-z]/g, '')
  return publicationAdapters[key] ?? null
}
