import { postAuthorInputSchema, postAuthorResult, postEditorInputSchema, postEditorResult } from '../../../agency_research/data/agents/post'
import { RESEARCH_POST_AUTHOR_AGENT_ID, RESEARCH_POST_EDITOR_AGENT_ID } from '../../../agency_research/lib/agents/ids.post'
import type { ResearchAgentRunner } from '../../../agency_research/lib/research/pipeline'

/** Local intelligence only: bind the draft to the actual selected TOP02 instruction.
 * The first draft repeats its opening; the real editor/repair loop must remove it.
 * No document, QA result, readiness flag or acceptance record is persisted here.
 */
export function createSelectedPostIntelligence(): ResearchAgentRunner {
  return async (agentId, raw) => {
    if (agentId === RESEARCH_POST_AUTHOR_AGENT_ID) {
      const input = postAuthorInputSchema.parse(raw)
      if (input.selected_item.topic_id !== 'TOP02' || input.selected_item.selection_status !== 'client_selected') {
        throw new Error('The post intelligence fixture requires the real explicit TOP02 selection')
      }
      const repaired = input.repair_findings.length > 0
      const opening = input.selected_item.audience_question
      const evidence = input.evidence_payload.filter((card) => card.kind === 'source_claim')
      if (!evidence.length) throw new Error('The selected instruction must carry real source evidence')
      const text = [opening, ...(!repaired ? [opening] : []), input.selected_item.main_message,
        ...evidence.map((card) => card.text), input.reader_value.title,
        ...input.reader_value.items.map((item) => `- ${item}`)].join('\n\n')
      return { usage: null, result: postAuthorResult.parse({ kind: 'research', data: {
        text,
        claims_map: evidence.map((card, index) => ({ local_ref: `fixture-${index}`, fragment: card.text,
          claim_id: card.claim_id, fact_ids: card.fact_ids, creative_payload_ids: [], kind: 'first_party_claim',
          evidence_kind: 'source_claim', source_ids: card.source_ids,
          limitation: card.limitations.join('; ') || 'Deklaracja źródła, nie niezależna weryfikacja.',
          used_within_evidence: true, source_relationship: 'Treść z zamrożonej karty dowodowej instrukcji.' })),
        links_and_mentions: [], client_note: 'Szkic demonstracyjny oparty na wybranym temacie i jego instrukcji. Wymaga akceptacji treści; nie zezwala na publikację.',
        self_check: { copy_checks: input.tov.copy_checks.map((check) => ({ id: check.id, result: 'not_applicable', evidence: 'Lokalna odpowiedź demonstracyjna, nie ocena modelu.' })),
          instruction_alignment: input.selected_item.topic_id, factual_scope: 'Tylko zamrożone karty instrukcji.',
          tone_of_voice: 'Lokalna odpowiedź demonstracyjna.', format: 'Tekst bez nowych adresów i liczb.', links: 'Brak nowych odnośników.',
          evidence_limitations: evidence.flatMap((card) => card.limitations) },
      } }) }
    }
    if (agentId === RESEARCH_POST_EDITOR_AGENT_ID) {
      const input = postEditorInputSchema.parse(raw)
      const opening = input.selected_item.audience_question
      const repeated = input.text.startsWith(`${opening}\n\n${opening}\n\n`)
      return { usage: null, result: postEditorResult.parse({ kind: 'research', data: {
        result: repeated ? 'needs_fix' : 'pass_for_draft',
        checked: ['Lokalna kontrola powtórzonego otwarcia dla rzeczywiście wybranego tematu.'],
        not_verified: ['Jakość żywego modelu, publikacja i akceptacja klienta.'],
        findings: repeated ? [{ code: 'other', severity: 'blocker', fragment: opening,
          issue: 'Otwarcie występuje dwa razy.', fix_hint: 'Usuń drugie wystąpienie otwarcia, zachowując dowody i temat.' }] : [],
        copy_checks: input.copy_checks.map((check) => ({ id: check.id, result: 'not_applicable', evidence: 'Deterministyczna inteligencja demonstracyjna.' })),
        summary: repeated ? 'Usuń powtórzone otwarcie.' : 'Powtórzenie usunięte; wynik demonstracyjny podlega rzeczywistym walidatorom.',
      } }) }
    }
    throw new Error(`Unexpected agent in selected-post intelligence fixture: ${agentId}`)
  }
}
