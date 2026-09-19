import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { KonfigPublikacjiData } from '../../../data/schemas/konfigPublikacji'
import { checkClientView, type ClientView } from '../clientView'

/**
 * WEW-KONFIG-PUBLIKACJI renders. Staff see every block (still no secrets — the
 * document never holds one); the client view (`client_projection` mode
 * `connection_status`) is platform, destination and readiness only.
 */

const T = {
  pl: {
    title: 'Konfiguracja publikacji',
    platform: 'Platforma',
    adapter: 'Adapter',
    destination: 'Miejsce publikacji',
    account: 'Konto / przestrzeń',
    channel: 'Kanał / strona',
    name: 'Nazwa',
    url: 'Adres publiczny',
    binding: 'Powiązanie z marką',
    basis: 'Podstawa',
    confirmation: 'Potwierdzenie',
    connection: 'Połączenie',
    state: 'Stan',
    ref: 'Referencja',
    capabilities: 'Możliwości adaptera',
    publish: 'publikacja tekstu',
    read: 'odczyt wyniku',
    limit: 'limit długości',
    mentions: 'oznaczenia',
    checked: 'sprawdzono',
    validation: 'Weryfikacja dostępu',
    method: 'metoda',
    failure: 'kod błędu',
    owner: 'Właściciel dostępu',
    contact: 'kontakt klienta',
    role: 'rola wewnętrzna',
    readiness: 'Gotowość',
    blockers: 'Braki',
    nextAction: 'Następny krok',
    issues: 'Ograniczenia i luki',
    none: '—',
    clientReady: 'Miejsce publikacji jest skonfigurowane technicznie. Zgoda na treść i na publikację pozostają osobnymi decyzjami.',
    clientNotReady: 'Miejsce publikacji nie jest jeszcze gotowe technicznie. To nie wpływa na akceptację treści; przed publikacją poprosimy o wskazanie dokładnego konta lub kanału.',
    unknown: 'nieznany',
  },
  en: {
    title: 'Publication configuration',
    platform: 'Platform',
    adapter: 'Adapter',
    destination: 'Destination',
    account: 'Account / workspace',
    channel: 'Channel / page',
    name: 'Name',
    url: 'Public URL',
    binding: 'Brand binding',
    basis: 'Basis',
    confirmation: 'Confirmation',
    connection: 'Connection',
    state: 'State',
    ref: 'Reference',
    capabilities: 'Adapter capabilities',
    publish: 'text publishing',
    read: 'result read-back',
    limit: 'length limit',
    mentions: 'mentions',
    checked: 'checked',
    validation: 'Access validation',
    method: 'method',
    failure: 'failure code',
    owner: 'Access owner',
    contact: 'client contact',
    role: 'internal role',
    readiness: 'Readiness',
    blockers: 'Blockers',
    nextAction: 'Next action',
    issues: 'Limitations and gaps',
    none: '—',
    clientReady: 'The destination is technically configured. Content approval and publication consent remain separate decisions.',
    clientNotReady: 'The destination is not technically ready yet. This does not affect content approval; before publication we will ask you to name the exact account or channel.',
    unknown: 'unknown',
  },
} as const

type Lang = keyof typeof T
const v = (value: string | number | null, none: string) => (value === null ? none : String(value))

export function renderKonfigPublikacji(args: { outputLanguage: Lang; brand: string; data: KonfigPublikacjiData; issues: DocumentIssue[] }): string {
  const t = T[args.outputLanguage]
  const d = args.data
  return [
    `# WEW-KONFIG-PUBLIKACJI — ${args.brand}`,
    '',
    `## ${t.platform}`,
    `- ${t.platform}: ${d.platform.platform}`,
    `- ${t.adapter}: ${d.platform.adapter_id} @ ${d.platform.adapter_version}`,
    '',
    `## ${t.destination}`,
    `- ${t.account}: ${v(d.destination_identity.account_or_workspace_id_or_null, t.none)}`,
    `- ${t.channel}: ${v(d.destination_identity.channel_or_page_id_or_null, t.none)}`,
    `- ${t.name}: ${d.destination_identity.display_name}`,
    `- ${t.url}: ${v(d.destination_identity.public_url_or_null, t.none)}`,
    '',
    `## ${t.binding}`,
    `- ${t.basis}: ${d.brand_binding.binding_basis}`,
    `- ${t.confirmation}: ${v(d.brand_binding.confirmation_ref_or_null, t.none)}`,
    '',
    `## ${t.connection}`,
    `- ${t.state}: ${d.secure_connection.connection_state}`,
    `- ${t.ref}: ${v(d.secure_connection.connection_ref_or_null, t.none)}`,
    '',
    `## ${t.capabilities}`,
    `- ${t.publish}: ${d.capabilities.can_publish_text} · ${t.read}: ${d.capabilities.can_read_result} · ${t.limit}: ${String(d.capabilities.length_limit_or_unknown)} · ${t.mentions}: ${d.capabilities.mention_controls} · ${t.checked}: ${v(d.capabilities.checked_at_or_null, t.none)}`,
    '',
    `## ${t.validation}`,
    `- ${t.state}: ${d.connection_validation.state} · ${t.method}: ${d.connection_validation.method} · ${t.checked}: ${v(d.connection_validation.checked_at_or_null, t.none)} · ${t.failure}: ${v(d.connection_validation.failure_code_or_null, t.none)}`,
    '',
    `## ${t.owner}`,
    `- ${t.contact}: ${v(d.access_owner.client_contact_ref_or_null, t.none)} · ${t.role}: ${d.access_owner.internal_role}`,
    '',
    `## ${t.readiness}: ${d.readiness.state}`,
    `${t.blockers}:`,
    ...(d.readiness.blockers.length ? d.readiness.blockers.map((b) => `- ${b}`) : [`- ${t.none}`]),
    `${t.nextAction}: ${d.readiness.next_action}`,
    '',
    `## ${t.issues}`,
    ...(args.issues.length ? args.issues.map((i) => `- **${i.code}** (${i.severity}) ${i.detail}`) : [`- ${t.none}`]),
    '',
  ].join('\n')
}

export function renderKonfigPublikacjiClientView(args: { outputLanguage: Lang; brand: string; data: KonfigPublikacjiData }): ClientView {
  const t = T[args.outputLanguage]
  const d = args.data
  const markdown = [
    `# ${t.title} — ${args.brand}`,
    '',
    `- ${t.platform}: ${d.platform.platform === 'unknown' ? t.unknown : d.platform.platform}`,
    `- ${t.destination}: ${d.destination_identity.display_name}`,
    `- ${t.readiness}: ${d.readiness.state}`,
    '',
    d.readiness.state === 'ready' ? t.clientReady : t.clientNotReady,
    '',
  ].join('\n')
  return checkClientView('WZR-KONFIG-PUBLIKACJI', markdown)
}
