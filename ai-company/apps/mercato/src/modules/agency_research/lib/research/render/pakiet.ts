import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { PakietData } from '../../../data/schemas/pakiet'
import { fitClientView, type ClientView } from '../clientView'

/**
 * KLI-PAKIET rendering. The client view follows WZR-PAKIET's projection (mode
 * `manifest`): materials by title / reference / version, the audit takeaways,
 * the publication receipt, a short how-to, limitations and the next-contact
 * note — one page that leads to the approved versions and never repeats them.
 */

const T = {
  pl: {
    title: 'Pakiet końcowy',
    manifest: 'Twoje materiały',
    takeaways: 'Wnioski z audytu i porównania rynku',
    receipt: 'Publikacja',
    howToUse: 'Jak korzystać',
    limitations: 'Ograniczenia',
    nextContact: 'Kolejny kontakt',
    version: 'wersja',
    availability: { available: 'dostępny', blocked: 'zablokowany', not_available: 'niedostępny' },
    approval: { approved: 'zatwierdzony', simulated_accepted: 'akceptacja symulowana', ready_for_review: 'do przeglądu', draft: 'szkic', not_applicable: '—', blocked: 'zablokowany' },
    outcome: { not_executed: 'nie wykonano', confirmed_published: 'opublikowano', confirmed_not_sent: 'nie wysłano', unknown: 'wynik nieznany' },
    link: 'link',
    noLink: 'brak zweryfikowanego linku',
    implication: 'skutek',
    limitation: 'ograniczenie',
    completion: 'Kontrola kompletności',
    delivery: 'Dostawa',
    closure: 'Bramka zamknięcia',
    identity: 'Pakiet',
    issues: 'Luki i ograniczenia',
    blockers: 'blokady',
    none: 'brak',
  },
  en: {
    title: 'Final package',
    manifest: 'Your materials',
    takeaways: 'Audit and market comparison takeaways',
    receipt: 'Publication',
    howToUse: 'How to use',
    limitations: 'Limitations',
    nextContact: 'Next contact',
    version: 'version',
    availability: { available: 'available', blocked: 'blocked', not_available: 'not available' },
    approval: { approved: 'approved', simulated_accepted: 'simulated acceptance', ready_for_review: 'for review', draft: 'draft', not_applicable: '—', blocked: 'blocked' },
    outcome: { not_executed: 'not executed', confirmed_published: 'published', confirmed_not_sent: 'not sent', unknown: 'outcome unknown' },
    link: 'link',
    noLink: 'no verified link',
    implication: 'implication',
    limitation: 'limitation',
    completion: 'Completion check',
    delivery: 'Delivery',
    closure: 'Closure gate',
    identity: 'Package',
    issues: 'Gaps and limitations',
    blockers: 'blockers',
    none: 'none',
  },
} as const

function bullets(items: string[], empty = '—'): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : `- ${empty}`
}

export function renderPakietClientView(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PakietData }): ClientView {
  const { data } = args
  const t = T[args.outputLanguage]
  const receipt = data.publication_receipt_ref
  const lines = [
    `# ${t.title} — ${args.brand}`,
    '',
    `## ${t.manifest}`,
    ...data.deliverables_manifest.map((row) => `- **${row.title}** — ${row.document_ref} (${t.version} ${row.content_version}; ${t.approval[row.approval_state]}; ${t.availability[row.availability_state]})`),
    '',
    `## ${t.takeaways}`,
    bullets(data.audit_takeaways.map((row) => `${row.finding} _(${t.implication}: ${row.implication}; ${t.limitation}: ${row.limitation})_`)),
    '',
    `## ${t.receipt}`,
    `${t.outcome[receipt.outcome]}${receipt.verified_url_or_null ? ` — ${t.link}: ${receipt.verified_url_or_null}` : ` — ${t.noLink}`}`,
    '',
    `## ${t.howToUse}`,
    bullets(data.how_to_use.map((row, index) => `${index + 1}. ${row.action} (${row.document_ref})`)),
    '',
    `## ${t.limitations}`,
    bullets(data.limitations.map((row) => `**${row.topic}:** ${row.limitation}`)),
    '',
    ...(data.next_contact ? [`## ${t.nextContact}`, data.next_contact, ''] : []),
  ]
  return fitClientView('WZR-PAKIET', lines, args.outputLanguage)
}

/** Internal markdown: the manifest with states, the checks and the gate — for staff. */
export function renderPakiet(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PakietData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  const gate = data.closure_gate
  return [
    `# KLI-PAKIET — ${args.brand}`,
    '',
    `## ${t.identity}`,
    `- ${data.package_identity.purchased_sku} · ${data.package_identity.purchased_offer_version} · ${data.package_identity.realization_state}`,
    '',
    `## ${t.manifest}`,
    ...data.deliverables_manifest.map((row) => `- ${row.kind}: ${row.document_ref} v${row.content_version} · ${row.approval_state} · ${row.availability_state}`),
    '',
    `## ${t.takeaways}`,
    bullets(data.audit_takeaways.map((row) => `${row.finding} ← ${row.source_finding_ref}; ${row.implication}; ${row.limitation}`)),
    '',
    `## ${t.receipt}`,
    `- ${data.publication_receipt_ref.receipt_ref}: ${data.publication_receipt_ref.outcome} · ${data.publication_receipt_ref.verified_url_or_null ?? '—'}`,
    '',
    `## ${t.limitations}`,
    bullets(data.limitations.map((row) => `${row.topic}: ${row.limitation} (${row.source_ref})`)),
    '',
    `## ${t.completion} · ${data.completion_check.state}`,
    `- ${t.blockers}: ${data.completion_check.blockers.join('; ') || t.none}`,
    '',
    `## ${t.delivery} · ${data.delivery.state}`,
    `- ${data.delivery.channel_or_null ?? '—'} · ${data.delivery.recipient_ref_or_null ?? '—'} · ${data.delivery.delivered_at_or_null ?? '—'} · ${data.delivery.delivery_evidence_ref_or_null ?? '—'}`,
    '',
    `## ${t.closure} · close_allowed=${gate.close_allowed}`,
    `- payment ${gate.payment_verified} · completion ${gate.completion_passed} · publication ${gate.publication_verified} · delivery ${gate.delivery_verified} · open_blockers ${gate.open_blockers}`,
    '',
    `## ${t.issues} (${args.issues.length})`,
    bullets(args.issues.map((issue) => `**${issue.code}** (${issue.severity}) ${issue.detail}`)),
    '',
  ].join('\n')
}
