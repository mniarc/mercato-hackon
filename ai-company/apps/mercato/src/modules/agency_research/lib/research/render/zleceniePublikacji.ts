import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { ZleceniePublikacjiData } from '../../../data/schemas/zleceniePublikacji'
import { checkClientView, type ClientView } from '../clientView'

/**
 * WEW-ZLECENIE-PUBLIKACJI renders. Staff see the whole order with the preflight
 * table; the client view (`client_projection` mode `consent`) shows exactly what
 * would be published and where — the material for a consent decision, never a
 * claim that anything was or will be sent.
 */

const T = {
  pl: {
    title: 'Zlecenie publikacji',
    postRef: 'Wersja treści',
    document: 'dokument',
    version: 'wersja',
    hash: 'hash treści',
    payload: 'Treść do publikacji (snapshot)',
    links: 'Linki',
    mentions: 'Polityka oznaczeń',
    format: 'Format platformy',
    destination: 'Miejsce',
    platform: 'platforma',
    account: 'konto / przestrzeń',
    channel: 'kanał / strona',
    label: 'etykieta',
    config: 'konfiguracja',
    approval: 'Zgoda na treść',
    consent: 'Zgoda na publikację',
    guard: 'Blokada wykonania',
    key: 'klucz idempotencji',
    reservation: 'rezerwacja',
    attempts: 'próby',
    prior: 'poprzedni wynik',
    hold: 'Wstrzymanie',
    preflight: 'Preflight (Q-PUB)',
    gate: 'Bramka',
    result: 'Wynik',
    detail: 'Szczegół',
    checked: 'sprawdzono',
    delivery: 'Tryb wykonania',
    issues: 'Ograniczenia i luki',
    none: '—',
    clientIntro: 'Poniżej dokładna treść i miejsce, których dotyczyłaby zgoda na publikację. Zgoda na treść i zgoda na publikację to dwie osobne decyzje; nic nie zostało wysłane.',
    clientWhere: 'Gdzie',
    clientState: (state: string) => `Stan zgody na publikację tej wersji w tym miejscu: ${state}.`,
  },
  en: {
    title: 'Publication order',
    postRef: 'Content version',
    document: 'document',
    version: 'version',
    hash: 'content hash',
    payload: 'Text to publish (snapshot)',
    links: 'Links',
    mentions: 'Mention policy',
    format: 'Platform format',
    destination: 'Destination',
    platform: 'platform',
    account: 'account / workspace',
    channel: 'channel / page',
    label: 'label',
    config: 'configuration',
    approval: 'Content approval',
    consent: 'Publication consent',
    guard: 'Execution guard',
    key: 'idempotency key',
    reservation: 'reservation',
    attempts: 'attempts',
    prior: 'prior outcome',
    hold: 'Hold',
    preflight: 'Preflight (Q-PUB)',
    gate: 'Gate',
    result: 'Result',
    detail: 'Detail',
    checked: 'checked',
    delivery: 'Delivery mode',
    issues: 'Limitations and gaps',
    none: '—',
    clientIntro: 'Below is the exact text and destination a publication consent would cover. Content approval and publication consent are two separate decisions; nothing has been sent.',
    clientWhere: 'Where',
    clientState: (state: string) => `Consent to publish this version at this destination: ${state}.`,
  },
} as const

type Lang = keyof typeof T
const v = (value: string | null, none: string) => value ?? none

export function renderZleceniePublikacji(args: { outputLanguage: Lang; brand: string; data: ZleceniePublikacjiData; issues: DocumentIssue[] }): string {
  const t = T[args.outputLanguage]
  const d = args.data
  return [
    `# WEW-ZLECENIE-PUBLIKACJI — ${args.brand}`,
    '',
    `## ${t.postRef}`,
    `- ${t.document}: ${d.post_ref.document_ref} · ${t.version}: ${d.post_ref.content_version} · ${t.hash}: ${d.post_ref.content_hash}`,
    '',
    `## ${t.payload}`,
    '',
    d.payload.text,
    '',
    `- ${t.links}: ${d.payload.link_refs.join(', ') || t.none}`,
    `- ${t.mentions}: ${d.payload.mention_policy}`,
    `- ${t.format}: ${d.payload.platform_format}`,
    '',
    `## ${t.destination}`,
    `- ${t.platform}: ${d.destination.platform} · ${t.account}: ${v(d.destination.account_or_workspace_id_or_null, t.none)} · ${t.channel}: ${v(d.destination.channel_or_page_id_or_null, t.none)}`,
    `- ${t.label}: ${d.destination.display_label} · ${t.config}: ${v(d.destination.config_ref_or_null, t.none)}`,
    '',
    `## ${t.approval}: ${d.content_approval_check.state}`,
    `- ${v(d.content_approval_check.approval_ref_or_null, t.none)} · ${t.version}: ${d.content_approval_check.checked_content_version}`,
    '',
    `## ${t.consent}: ${d.publication_consent_check.state}`,
    `- ${v(d.publication_consent_check.consent_ref_or_null, t.none)} · ${t.hash}: ${v(d.publication_consent_check.bound_content_hash_or_null, t.none)} · ${t.destination}: ${v(d.publication_consent_check.bound_destination_or_null, t.none)}`,
    '',
    `## ${t.guard}`,
    `- ${t.key}: ${d.execution_guard.idempotency_key} · ${t.reservation}: ${d.execution_guard.reservation_state} · ${t.attempts}: ${d.execution_guard.attempt_refs.join(', ') || t.none} · ${t.prior}: ${d.execution_guard.prior_outcome}`,
    '',
    `## ${t.hold}: ${d.current_hold.state}`,
    `- ${v(d.current_hold.reason_or_null, t.none)} · ${v(d.current_hold.request_ref_or_null, t.none)}`,
    '',
    `## ${t.preflight}: ${d.preflight.state} (${t.checked}: ${v(d.preflight.checked_at_or_null, t.none)})`,
    '',
    `| ${t.gate} | ${t.result} | ${t.detail} |`,
    '|---|---|---|',
    ...d.preflight.check_results.map((r) => `| ${r.gate} | ${r.result} | ${v(r.detail, t.none)} |`),
    '',
    `## ${t.delivery}`,
    `- ${d.delivery_instruction.mode} · ${v(d.delivery_instruction.requested_time_or_null, t.none)}`,
    '',
    `## ${t.issues}`,
    ...(args.issues.length ? args.issues.map((i) => `- **${i.code}** (${i.severity}) ${i.detail}`) : [`- ${t.none}`]),
    '',
  ].join('\n')
}

export function renderZleceniePublikacjiClientView(args: { outputLanguage: Lang; brand: string; data: ZleceniePublikacjiData }): ClientView {
  const t = T[args.outputLanguage]
  const d = args.data
  const markdown = [
    `# ${t.title} — ${args.brand}`,
    '',
    t.clientIntro,
    '',
    `## ${t.payload}`,
    '',
    d.payload.text,
    '',
    ...(d.payload.link_refs.length ? [`${t.links}: ${d.payload.link_refs.join(', ')}`, ''] : []),
    `## ${t.clientWhere}`,
    `- ${d.destination.platform}: ${d.destination.display_label}`,
    '',
    t.clientState(d.publication_consent_check.state),
    '',
  ].join('\n')
  return checkClientView('WZR-ZLECENIE-PUBLIKACJI', markdown)
}
