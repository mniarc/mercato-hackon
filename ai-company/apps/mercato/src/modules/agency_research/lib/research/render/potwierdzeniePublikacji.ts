import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { PotwierdzeniePublikacjiData } from '../../../data/schemas/potwierdzeniePublikacji'
import { checkClientView, type ClientView } from '../clientView'

/**
 * WEW-POTWIERDZENIE-PUBLIKACJI renders. The client view (`client_projection`
 * mode `receipt`) states the outcome plainly: before a confirmed publication it
 * says so and shows no link, no id and no time — "przed sukcesem nie udawaj
 * dostawy".
 */

const T = {
  pl: {
    title: 'Potwierdzenie publikacji',
    execution: 'Próba',
    orderRef: 'zlecenie',
    attempt: 'próba',
    reservation: 'rezerwacja',
    material: 'Zatwierdzony materiał',
    post: 'post',
    version: 'wersja',
    hash: 'hash',
    approval: 'zgoda na treść',
    consent: 'zgoda na publikację',
    destination: 'Miejsce',
    platform: 'platforma',
    account: 'konto / przestrzeń',
    channel: 'kanał / strona',
    outcome: 'Wynik',
    artifact: 'Artefakt zewnętrzny',
    externalId: 'id',
    url: 'zweryfikowany adres',
    publishedAt: 'opublikowano',
    proof: 'Dowód',
    method: 'metoda',
    evidence: 'dowód',
    verifiedAt: 'zweryfikowano',
    match: 'zgodność treści',
    failure: 'Szczegóły niepowodzenia',
    code: 'kod',
    message: 'komunikat',
    recovery: 'Dalsze kroki',
    nextAction: 'akcja',
    retry: 'ponowienie dozwolone',
    required: 'wymagany dowód',
    exception: 'wyjątek',
    receipt: 'Komunikat dla klienta',
    issues: 'Ograniczenia i luki',
    none: '—',
    yes: 'tak',
    no: 'nie',
    outcomes: {
      not_executed: 'Publikacja nie została wykonana. To zapis brakujących warunków, nie dowód publikacji.',
      confirmed_published: 'Publikacja potwierdzona przez platformę.',
      confirmed_not_sent: 'Platforma potwierdziła, że publikacja nie nastąpiła.',
      unknown: 'Wynik publikacji jest nieznany; sprawa jest wyjaśniana. Nie ponawiamy automatycznie.',
    },
  },
  en: {
    title: 'Publication confirmation',
    execution: 'Attempt',
    orderRef: 'order',
    attempt: 'attempt',
    reservation: 'reservation',
    material: 'Approved material',
    post: 'post',
    version: 'version',
    hash: 'hash',
    approval: 'content approval',
    consent: 'publication consent',
    destination: 'Destination',
    platform: 'platform',
    account: 'account / workspace',
    channel: 'channel / page',
    outcome: 'Outcome',
    artifact: 'External artifact',
    externalId: 'id',
    url: 'verified URL',
    publishedAt: 'published at',
    proof: 'Proof',
    method: 'method',
    evidence: 'evidence',
    verifiedAt: 'verified at',
    match: 'content match',
    failure: 'Failure details',
    code: 'code',
    message: 'message',
    recovery: 'Recovery',
    nextAction: 'next action',
    retry: 'retry allowed',
    required: 'required evidence',
    exception: 'exception',
    receipt: 'Client receipt',
    issues: 'Limitations and gaps',
    none: '—',
    yes: 'yes',
    no: 'no',
    outcomes: {
      not_executed: 'The publication was not executed. This records what is missing; it is not a proof of publication.',
      confirmed_published: 'Publication confirmed by the platform.',
      confirmed_not_sent: 'The platform confirmed that nothing was published.',
      unknown: 'The publication outcome is unknown and being reconciled. No automatic retry.',
    },
  },
} as const

type Lang = keyof typeof T
const v = (value: string | null, none: string) => value ?? none

export function renderPotwierdzeniePublikacji(args: { outputLanguage: Lang; brand: string; data: PotwierdzeniePublikacjiData; issues: DocumentIssue[] }): string {
  const t = T[args.outputLanguage]
  const d = args.data
  return [
    `# WEW-POTWIERDZENIE-PUBLIKACJI — ${args.brand}`,
    '',
    `## ${t.outcome}: ${d.outcome}`,
    t.outcomes[d.outcome],
    '',
    `## ${t.execution}`,
    `- ${t.orderRef}: ${d.execution_ref.publication_order_ref} · ${t.attempt}: ${v(d.execution_ref.attempt_id_or_null, t.none)} · ${t.reservation}: ${v(d.execution_ref.reservation_key_or_null, t.none)}`,
    '',
    `## ${t.material}`,
    `- ${t.post}: ${d.approved_material_ref.post_ref} · ${t.version}: ${v(d.approved_material_ref.content_version, t.none)} · ${t.hash}: ${v(d.approved_material_ref.content_hash, t.none)}`,
    `- ${t.approval}: ${v(d.approved_material_ref.content_approval_ref_or_null, t.none)} · ${t.consent}: ${v(d.approved_material_ref.publication_consent_ref_or_null, t.none)}`,
    '',
    `## ${t.destination}`,
    `- ${t.platform}: ${d.destination.platform} · ${t.account}: ${v(d.destination.account_or_workspace_id_or_null, t.none)} · ${t.channel}: ${v(d.destination.channel_or_page_id_or_null, t.none)}`,
    '',
    `## ${t.artifact}`,
    `- ${t.externalId}: ${v(d.external_artifact.external_post_id_or_null, t.none)} · ${t.url}: ${v(d.external_artifact.verified_url_or_null, t.none)} · ${t.publishedAt}: ${v(d.external_artifact.published_at_or_null, t.none)}`,
    '',
    `## ${t.proof}`,
    `- ${t.method}: ${d.proof.method} · ${t.evidence}: ${v(d.proof.evidence_ref_or_null, t.none)} · ${t.verifiedAt}: ${v(d.proof.verified_at_or_null, t.none)} · ${t.match}: ${d.proof.content_match_state}`,
    '',
    `## ${t.failure}`,
    `- ${t.code}: ${v(d.failure_details.code_or_null, t.none)} · ${t.message}: ${v(d.failure_details.sanitized_message_or_null, t.none)} · ${t.evidence}: ${v(d.failure_details.evidence_ref_or_null, t.none)}`,
    '',
    `## ${t.recovery}`,
    `- ${t.nextAction}: ${d.recovery.next_action} · ${t.retry}: ${d.recovery.retry_allowed ? t.yes : t.no} · ${t.exception}: ${v(d.recovery.exception_ref_or_null, t.none)}`,
    `- ${t.required}: ${d.recovery.required_evidence}`,
    '',
    `## ${t.receipt}`,
    v(d.client_receipt, t.none),
    '',
    `## ${t.issues}`,
    ...(args.issues.length ? args.issues.map((i) => `- **${i.code}** (${i.severity}) ${i.detail}`) : [`- ${t.none}`]),
    '',
  ].join('\n')
}

export function renderPotwierdzeniePublikacjiClientView(args: { outputLanguage: Lang; brand: string; data: PotwierdzeniePublikacjiData }): ClientView {
  const t = T[args.outputLanguage]
  const d = args.data
  const published = d.outcome === 'confirmed_published'
  const markdown = [
    `# ${t.title} — ${args.brand}`,
    '',
    `- ${t.outcome}: ${d.outcome}`,
    `- ${t.destination}: ${d.destination.platform}`,
    ...(published ? [`- ${t.url}: ${v(d.external_artifact.verified_url_or_null, t.none)}`, `- ${t.publishedAt}: ${v(d.external_artifact.published_at_or_null, t.none)}`] : []),
    '',
    published && d.client_receipt ? d.client_receipt : t.outcomes[d.outcome],
    '',
  ].join('\n')
  return checkClientView('WZR-POTWIERDZENIE-PUBLIKACJI', markdown)
}
