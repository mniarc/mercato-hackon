import { briefDataSchema, type BriefData } from '../data/schemas/brief'
import { strategiaDataSchema, type StrategiaData } from '../data/schemas/strategia'
import { tovDataSchema, type TovData } from '../data/schemas/tov'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { zrodlaDataSchema, type ZrodlaData } from '../data/schemas/zrodla'

export const orderOf = (platform: string) =>
  orderFactsOf(
    orderDataSchema.parse({
      product_selection: { sku: 'START-KOMUNIKACJI-PL-01', offer_version: 'v1', price_net: 2500, currency: 'PLN', result_limits: { topics: 12 } },
      brand: { display_name: 'FLOW Centrum Badawcze', website_url: 'https://makeitflow.pl/index.php' },
      market_language: { market: 'Polska', language: 'pl' },
      official_social: { url: 'https://www.linkedin.com/company/flow-centrum-badawcze/', platform, provenance: 'client_provided' },
      purchase_goal: 'Wyjaśnić, jak FLOW pomaga dojść od problemu do rozwiązania.',
    }),
  )

const src = (id: string): ZrodlaData['sources'][number] => ({
  source_id: id, canonical_source_id: id, independent_material_id: `MAT-${id}`, url_or_file: 'https://makeitflow.pl/index.php', publisher: 'FLOW', kind: 'oficjalna strona', title: 'FLOW — opis i FAQ',
  retrieved_at: '2026-09-19T10:00:00.000Z', published_at: null, access: 'full', read_scope: 'read', limitation: null, source_visibility: 'public', duplicate_of: null, origin: 'purchase_form',
})
const fact = (id: string, claim: string): ZrodlaData['facts'][number] => ({
  fact_id: id, entity: 'FLOW', claim, source_ids: ['S-01'], locator: { source_id: 'S-01', quote: claim, char_offset: 0 }, paraphrase: claim, kind: 'first_party_claim', use_scope: [], limitation: null,
})
const seed = (id: string, question: string, factIds: string[], proofIds: string[]): ZrodlaData['content_bank'][number] => ({
  seed_id: id, audience_question: question, angle: `ujęcie ${id}`,
  source_claim: { text: `Deklaracja firmy dla ${id}: punktem wyjścia jest problem, nie technologia.`, fact_ids: factIds, source_ids: ['S-01'], provenance: 'observed' },
  proposed_utility: { text: `Autorska checklista dla ${id}.`, provenance: 'creative_proposal' },
  fact_ids: factIds, proof_ids: proofIds, provenance: 'inferred',
  reuse_of_evidence: { note: null, shared_fact_ids: [], shared_proof_ids: [] },
  prohibited_claims: ['Nie obiecywać wyniku, którego nie ma w faktach.'], readiness: 'ready', readiness_reason: null,
})

export function zrodla(): ZrodlaData {
  const questions = ['Od czego zacząć, gdy chcemy nowego narzędzia?', 'Czy musimy mieć specyfikację?', 'Kiedy AI ma sens?', 'Jak sprawdzić założenia?', 'Co składa się na diagnozę?', 'Cały cykl czy etap?', 'Ile to kosztuje?', 'Czym jest Flowco.AI?', 'Co daje partnerstwo?', 'Jak brzmi produkt cyfrowy?', 'Jak szybko prototyp?', 'Od czego zacząć z narzędziem do procesu?', 'Jak rozmawiać o budżecie?']
  return zrodlaDataSchema.parse({
    sources: [src('S-01')],
    facts: Array.from({ length: 11 }, (_, index) => fact(`F${String(index + 1).padStart(2, '0')}`, `Fakt numer ${index + 1} o sposobie pracy FLOW.`)),
    proof_cards: [
      { proof_id: 'P01', proof_type: 'declaration', problem: 'p', actual_action: null, artifact_or_method: 'Cztery obszary diagnozy', observed_result: null, fact_ids: ['F03', 'F04'], source_ids: ['S-01'], limitations: ['brak zmierzonego wyniku'], source_visibility: 'public', allowed_use: 'client_review', use_basis_ref: 'KLI-BRIEF.assets_and_permissions', client_name_permission: 'not_applicable', quote_permission: 'granted', provenance: 'inferred' },
      { proof_id: 'P02', proof_type: 'declaration', problem: null, actual_action: null, artifact_or_method: 'AI tylko z uzasadnieniem', observed_result: null, fact_ids: ['F05'], source_ids: ['S-01'], limitations: [], source_visibility: 'public', allowed_use: 'internal_only', use_basis_ref: null, client_name_permission: 'unknown', quote_permission: 'unknown', provenance: 'inferred' },
    ],
    language_samples: [],
    audience_signals: [],
    content_bank: questions.map((question, index) => seed(`T${String(index + 1).padStart(2, '0')}`, question, [`F${String((index % 11) + 1).padStart(2, '0')}`], index % 2 ? ['P02'] : ['P01'])),
    conflicts: [],
    coverage: [],
  })
}

export function strategia(): StrategiaData {
  const claim = (id: string, allowed: string) => ({ claim_id: id, allowed_claim: allowed, mechanism: 'diagnoza', proof_ids: ['P01'], fact_ids: ['F03'], source_ids: ['S-01'], status: 'declared_method' as const, limitations: ['deklaracja, nie wynik'], forbidden_claim: 'gwarancja efektu', confirmation_owner: 'none_needed' })
  const pillar = (id: string, area: string) => ({ pillar_id: id, area, strategic_goal: `cel ${id}`, audience_question: `pytanie ${id}`, allowed_content: ['sposób pracy'], exclusions: ['wyniki liczbowe'], claim_ids: ['CL01'], seed_ids: ['T01'] })
  return strategiaDataSchema.parse({
    strategic_choice: { positioning: 'Partner od problemu do rozwiązania', audience: 'Właściciele procesów w firmach B2B', situation: 'potrzeba nowego narzędzia', category: 'badania i wdrożenia', decision: 'KLI-BRIEF.priority_offer', deprioritized: ['szkolenia'], rationale: 'najlepiej udokumentowana oferta', status: 'client_decision', evidence_ids: ['F01'] },
    buyer_tension: { desired_progress: 'sprawniejszy proces', barrier: 'brak specyfikacji', illustrative_objection: 'musimy mieć specyfikację', objection_status: 'illustrative_hypothesis', status_quo_risk: 'obejścia', decision_criterion: { text: null, status: 'unknown', origin: 'brak danych', empirical_buyer_evidence: null }, evidence_status: 'hipoteza', evidence_ids: ['F04'] },
    uvp: { claim_id: 'CL01', working_sentence: 'Zaczynamy od problemu, nie od technologii.', explanation: ['diagnoza przed specyfikacją'], mechanism: 'cztery obszary diagnozy', alternative: 'software house budujący ze specyfikacji', reason_to_believe: 'opisany sposób pracy', evidence_ids: ['F03'], support_level: 'declared_method', use_conditions: ['bez obietnicy wyniku'], alternative_status: 'hipoteza' },
    options_considered: [{ direction: 'AI-first', advantage: 'modne', rejection: 'brak dowodów' }],
    proof_architecture: [claim('CL01', 'Zaczynamy od diagnozy problemu.'), claim('CL02', 'AI tylko z uzasadnieniem biznesowym.'), claim('CL03', 'Cały cykl albo jeden etap.')],
    message_hierarchy: { main_promise: { text: 'Od problemu do uzasadnionego rozwiązania', status: 'declared_method', claim_ids: ['CL01'] }, supporting_messages: [{ order: 1, text: 'diagnoza', claim_ids: ['CL01'], fact_ids: ['F03'] }], explanation_order: ['problem', 'diagnoza', 'rozwiązanie'] },
    pillars: [pillar('PL01', 'Problem przed narzędziem'), pillar('PL02', 'Sposób pracy'), pillar('PL03', 'Decyzje o zakresie')],
    channel_role: { channel: 'LinkedIn firmy FLOW', role: 'pierwsze skojarzenie', knowledge_level: 'ogólny', contact_path: 'strona', content_scope: 'sposób pracy', limits: 'bez wyników liczbowych', contact_owner: null, evidence_ids: ['F07'] },
    measurement_hypothesis: { hypothesis: 'więcej zapytań z opisem problemu', observable_signals: ['zapytania'], measures: [{ name: 'zapytania', definition: 'liczba wiadomości' }], baseline: null, numerical_target: null, future_test: 'porównanie kwartałów', causality_limit: 'brak atrybucji', evidence_ids: [] },
    creative_boundaries: { not_promoted: ['szkolenia'], prohibited_promises: ['Procentowe oszczędności.', 'Jedyność na rynku.'], permitted_creativity: 'metafory i pytania', rights: 'cytaty tylko z materiałów publicznych', open_assumptions: ['brak analityki wewnętrznej'], plan_effect: 'tematy bez liczb', research_return_required: false },
  })
}

export function tov(): TovData {
  const principle = (trait: string, behavior: string) => ({ trait, purpose: 'cel', author_behavior: behavior, typical_error: 'błąd' })
  const axis = (axis: TovData['style_axes'][number]['axis']) => ({ axis, position: 'środek', example: 'przykład', change_when: 'nigdy' })
  return tovDataSchema.parse({
    voice_principles: [principle('konkretny', 'Otwórz trudnością odbiorcy, nie listą kompetencji.'), principle('partnerski', 'Nazwij niewiadome zamiast pouczać.'), principle('jasny', 'Wyjaśnij termin przez czynność.'), principle('ostrożny', 'Opisuj sposób pracy bez gwarancji wyniku.'), principle('uczciwy', 'Oznacz wymyślony przykład w tekście.'), principle('nadmiarowy', 'Ta zasada nie mieści się w wyciągu.')],
    style_axes: (['formality', 'directness', 'technicality', 'humor', 'claim_strength'] as const).map(axis),
    wording: { preferred_in_context: ['diagnoza'], replacements: [{ avoid: 'rewolucja', use: 'zmiana' }], replacement_boundary: 'nie zmieniaj cytatów', cliches: ['rewolucyjny', 'game changer'], expert_terms: 'wyjaśniaj', sentence_pattern: 'Chcesz zmienić proces? Zacznij od opisania sytuacji.' },
    evidence_language: [{ type: 'fact', pattern: 'Firma deklaruje…', forbidden_upgrade: 'Firma gwarantuje…' }],
    before_after: [{ before: 'Jesteśmy liderem.', after: 'Zaczynamy od problemu.', changed_principle: 'konkretny', fact_ids: ['F03'], status: 'grounded' }],
    context_rules: [{ situation: 'pytanie o cenę', tone_and_example: 'spokojnie', boundary: 'bez kwot' }],
    copy_checks: ['Czy otwarcie nazywa problem odbiorcy?', 'Czy każdy fakt ma źródło?', 'Czy brak liczb bez dowodu?', 'Czy CTA jest jedno?', 'Czy przykład jest oznaczony?', 'Czy brak klisz?'],
  })
}

export function brief(): BriefData {
  const decided = { decision_state: 'client_selected' as const, decision_ref: 'WEW-USTALENIA', fact_ids: ['F01'] }
  return briefDataSchema.parse({
    priority_offer: { value: 'Pomoc w rozpoznaniu problemu i uzasadnionym rozwiązaniu cyfrowym.', ...decided, result_for_audience: 'podstawa decyzji', excluded_from_scope: ['szkolenia'] },
    priority_audience: { value: 'Właściciele procesów, COO i liderzy produktu w polskich firmach B2B.', ...decided, priority_choice: { segment: 'B2B', target_role: ['COO'], decision_ref: null, decision_version: null, decision_state: 'client_selected' }, buyer_claims: [], secondary_groups: null },
    business_direction: { value: 'Więcej zapytań z opisanym problemem.', ...decided, from_to: 'od zleceń ze specyfikacją do rozmów o problemie', horizon: null, baseline: null, communication_role: 'edukacja', not_promised: ['wyniki liczbowe'] },
    buyer_reality: [],
    promise_constraints: { capabilities: 'sposób pracy', result_limits: 'brak zmierzonych efektów', prohibited_claims: ['Gwarancja czasu.', 'Liczba klientów.'], allowed_proof_ids: ['P01'], rights_by_proof: [], fact_ids: ['F03'] },
    voice_preferences: { desired_traits: ['konkretny'], unwanted_traits: ['nadęty'], style_preferences: { jargon: null, humor: null, formalness: null }, proposed_examples: [], client_selection: null, decision_version: null, decision_state: 'awaiting_client', sample_ids: [] },
    channel_and_cta: { channel: 'LinkedIn firmy FLOW', audience_context: 'B2B', cta_goal: 'Zaproszenie do rozmowy o konkretnej trudności.', cta_text: 'Masz konkretną trudność w procesie? Opisz ją nam przez stronę.', destination: 'https://makeitflow.pl/index.php', destination_visibility: 'observed', destination_functionality: 'not_checked', owner: null, required_owner_before_publish: true, draft_readiness: 'conditional', publication_readiness: 'blocked', limits: ['bez nowych URL'], fact_ids: ['F07'], decision_state: 'client_selected' },
    success_and_limits: { directional_goal: 'więcej zapytań', measurement_proposals: [], baseline: null, numerical_target: null, scope_limit: 'jeden post' },
    assets_and_permissions: [],
    open_assumptions: [],
  })
}

