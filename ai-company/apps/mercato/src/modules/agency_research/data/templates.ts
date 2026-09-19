import type { TemplateId } from './schemas/envelope'

/**
 * The parts of Rafał's `contracts.json` the code needs at run time: MUST keys per
 * template, client-view budgets and the STD-LIMITY numbers. Kept as a typed const
 * so the gate and the renderer never re-read the package.
 */

export const templates = {
  'WZR-ZAMOWIENIE': { process: '1.3', mustKeys: ['product_selection', 'brand', 'market_language'], clientWords: null },
  'WZR-ZRODLA': {
    process: '3.2',
    mustKeys: ['sources', 'facts', 'proof_cards', 'language_samples', 'audience_signals', 'content_bank', 'conflicts', 'coverage'],
    clientWords: null,
  },
  'WZR-AUDYT': {
    process: '3.3',
    mustKeys: ['offer_map', 'buyer_map', 'message_map', 'voice_audit', 'journey', 'gaps', 'reusable_assets'],
    clientWords: 450,
  },
  'WZR-KONKURENCJA': { process: '3.4-3.5', mustKeys: ['selection', 'cards', 'parity_claims', 'difference_candidates', 'implications'], clientWords: 350 },
  'WZR-USTALENIA': { process: '3.6', mustKeys: ['field_map', 'questions', 'evidence_requests', 'readiness'], clientWords: null },
  'WZR-BRIEF': {
    process: '4.1',
    mustKeys: ['priority_offer', 'priority_audience', 'business_direction', 'promise_constraints', 'voice_preferences', 'channel_and_cta', 'open_assumptions'],
    clientWords: 700,
  },
  'WZR-ESKALACJA': { process: 'E.1', mustKeys: ['exception_type', 'evidence', 'assignment', 'hold', 'decision_question'], clientWords: null },
  'WZR-STRATEGIA': {
    process: '5.2',
    mustKeys: ['strategic_choice', 'buyer_tension', 'uvp', 'proof_architecture', 'message_hierarchy', 'pillars', 'channel_role', 'creative_boundaries'],
    clientWords: 1100,
  },
  'WZR-TOV': {
    process: '5.3',
    mustKeys: ['voice_principles', 'style_axes', 'wording', 'evidence_language', 'before_after', 'context_rules', 'copy_checks'],
    clientWords: 750,
  },
  'WZR-PLAN': { process: '6.2', mustKeys: ['plan_context', 'topics', 'balance', 'recommendation', 'selected_topic'], clientWords: null },
  'WZR-ZLECENIE-POSTU': {
    process: '6.7',
    mustKeys: ['selected_item', 'evidence_payload', 'reader_value', 'voice_extract', 'delivery_constraints', 'completion'],
    clientWords: null,
  },
  'WZR-POST': { process: '7.2', mustKeys: ['text', 'target', 'claims_map', 'links_and_mentions', 'qa'], clientWords: 80 },
  'WZR-KONFIG-PUBLIKACJI': {
    process: '8.2',
    mustKeys: ['platform', 'destination_identity', 'brand_binding', 'secure_connection', 'capabilities', 'connection_validation', 'readiness'],
    clientWords: null,
  },
  'WZR-ZLECENIE-PUBLIKACJI': {
    process: '8.1',
    mustKeys: ['post_ref', 'payload', 'destination', 'content_approval_check', 'publication_consent_check', 'execution_guard', 'current_hold', 'preflight'],
    clientWords: null,
  },
  'WZR-POTWIERDZENIE-PUBLIKACJI': {
    process: '8.7',
    mustKeys: ['execution_ref', 'approved_material_ref', 'destination', 'outcome', 'external_artifact', 'proof', 'failure_details', 'recovery'],
    clientWords: null,
  },
  'WZR-PAKIET': {
    process: '9.1',
    mustKeys: ['package_identity', 'deliverables_manifest', 'audit_takeaways', 'publication_receipt_ref', 'limitations', 'completion_check', 'delivery', 'closure_gate'],
    clientWords: null,
  },
} satisfies Record<TemplateId, { process: string; mustKeys: readonly string[]; clientWords: number | null }>

/** STD-LIMITY v1.1 — technical settings to tune on tests; never client revision counters. */
export const limits = {
  research: {
    clientWebPagesMax: 10,
    clientSocialItemsTarget: 8,
    competitorEntitiesMax: 3,
    competitorPagesEachMax: 4,
    fetchAttemptsPerUrl: 2,
    /** One page's markdown beyond this is chunked by headings before extraction. */
    pageChunkChars: 40_000,
    /** Whole-site cap on stored text per order — a runaway crawl must not become a runaway bill. */
    maxTotalChars: 400_000,
  },
  generation: {
    technicalAttemptsPerTask: 2,
    qaRepairAttemptsPerRun: 2,
    groundingRetries: 2,
    concurrentRunsPerDocument: 1,
  },
  cost: {
    /** STD-LIMITY order-level ceilings. */
    warningPlnPerOrderRun: 50,
    pausePlnPerOrderRun: 100,
    /** Our per-run defaults — the OpenRouter key belongs to the client. */
    defaultMaxPlnPerRun: 20,
    warnPlnPerRun: 10,
    confirmAbovePln: 10,
  },
  clientText: {
    auditSummaryWordsMax: 450,
    briefWordsMax: 700,
    strategyWordsMax: 1100,
    tovWordsMax: 750,
    planRows: 12,
    questionBatchMax: 8,
    postClientNoteWordsMax: 80,
    postWordsTarget: [120, 220] as [number, number],
    receiptCharsMax: 350,
    nextContactCharsMax: 250,
    auditTakeaways: [3, 5] as [number, number],
    howToUseMax: 3,
  },
  content: {
    /** KLI-PLAN topics; one finished post per purchased package. */
    planTopics: 12,
    finishedPosts: 1,
    pillars: [3, 4] as [number, number],
    voiceExtractRulesMax: 5,
    copyChecks: [6, 8] as [number, number],
    beforeAfterPairs: 3,
    /** Q-T: post repair attempts before escalation. */
    postRepairAttempts: 2,
  },
} as const

/** The nine needs every later document has of the register (WZR-ZRODLA.coverage). */
export const coverageNeeds = ['segment', 'problem', 'zakup', 'oferta', 'mechanizm', 'dowód', 'alternatywy', 'język', 'CTA'] as const

/** Deterministic id prefixes (Rafał's alphabet). */
export const idPrefixes = {
  source: 'S',
  fact: 'F',
  competitorFact: 'C',
  proof: 'P',
  sample: 'L',
  signal: 'A',
  seed: 'T',
  conflict: 'X',
  gap: 'G',
  difference: 'D',
  question: 'Q',
  evidenceRequest: 'ER',
  claim: 'CL',
  pillar: 'PL',
  topic: 'TOP',
  claimMap: 'CM',
  copyCheck: 'TOV',
} as const
