import type { EskalacjaData } from '../../../data/schemas/eskalacja'

/**
 * WEW-ESKALACJA renders. Staff see the whole case; the client view is status +
 * reason + a question only — no logs, no queue names, no secrets (WZR-ESKALACJA
 * `client_projection`: mode `status`).
 */

export function renderEskalacja(args: { brand: string; data: EskalacjaData; clientView?: boolean }): string {
  const { data } = args
  if (args.clientView) {
    return [
      '# Status realizacji',
      '',
      `Prace nad częścią zamówienia są wstrzymane: ${data.exception_type.summary}`,
      data.client_update.needed && data.client_update.message_or_null ? `\n${data.client_update.message_or_null}` : '',
      '',
      'Odezwiemy się, gdy sprawa zostanie rozstrzygnięta po naszej stronie.',
      '',
    ].join('\n')
  }
  return [
    `# WEW-ESKALACJA — ${args.brand}`,
    '',
    `## Wyjątek: ${data.exception_type.code} (krok ${data.exception_type.trigger_step})`,
    data.exception_type.summary,
    '',
    '## Dowody i dotychczasowe próby',
    ...data.evidence.map((e) => `- **${e.ref}** ${e.fact} _(${e.occurred_at_or_unknown})_`),
    '',
    '## Właściciel',
    `- Rola: ${data.assignment.role}`,
    `- Pracownik: ${data.assignment.employee_id_or_unassigned}`,
    `- Kolejka: ${data.assignment.queue}`,
    '',
    '## Zakres wstrzymania',
    `- Wstrzymane: ${data.hold.blocked_task_refs.join(', ') || '—'}`,
    `- Niezależne (mogą trwać): ${data.hold.independent_task_refs.join(', ') || '—'}`,
    `- Blokada akcji zewnętrznych: ${data.hold.external_action_lock ? 'tak' : 'nie'}`,
    '',
    '## Pytanie do rozstrzygnięcia',
    data.decision_question,
    '',
    '## Dozwolone rozstrzygnięcia',
    ...data.allowed_resolutions.map((r) => `- **${r.code}** → ${r.permitted_next_step}; wymagany dowód: ${r.required_evidence}`),
    '',
    `## Stan: ${data.resolution.state} · wznowienie ${data.resume.state}${data.resume.next_step_or_null ? ` → ${data.resume.next_step_or_null}` : ''}`,
    '',
  ].join('\n')
}
