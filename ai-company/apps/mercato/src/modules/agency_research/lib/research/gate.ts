import type { z } from 'zod'
import type { DocumentIssue } from '../../data/schemas/envelope'
import type { coverageRequirements, ContentSeed, CoverageItem, ProofCard } from '../../data/schemas/zrodla'
import type { PageExtraction, contentSeederResult, conflictFinderResult, coverageAssessorResult, proofBuilderResult } from '../../data/validators'
import { resolveId } from './ids'
import { looksLikeInstruction, quoteIsVerbatim, wordSetSimilarity } from './util'

/**
 * Deterministic cite-or-abstain gate for the research documents — pure, replayable,
 * no model judges another model. A model may only point at evidence it was given:
 * every quote must be verbatim in the page it came from, every cited id must exist
 * in the pinned inputs. What fails is dropped and reported as an issue on the
 * document; a section that keeps nothing where something is required is rejected so
 * the pipeline re-requests instead of propagating an invented register.
 */

export type GateIssue = DocumentIssue & { path: string }

export type Gated<T> = { value: T; issues: GateIssue[]; kept: number; dropped: number }

export class GateError extends Error {
  constructor(readonly section: string, readonly issues: GateIssue[]) {
    super(`[internal] ${section}: nothing grounded survived (${issues.length} issues)`)
  }
}

const issue = (code: string, path: string, detail: string, severity = 'dropped'): GateIssue => ({ code, severity, detail, path })

/** 3.2 map: quotes verbatim in the page, refs unique, instruction-looking text kept out of the bank. */
export function gatePageExtraction(extraction: PageExtraction, pageText: string, sourceId: string): Gated<PageExtraction> {
  const issues: GateIssue[] = []
  const seenRefs = new Set<string>()
  const facts = extraction.facts.filter((fact, index) => {
    const path = `${sourceId}.facts[${index}]`
    if (seenRefs.has(fact.local_ref)) {
      issues.push(issue('DUPLICATE_REF', path, `local_ref ${fact.local_ref} repeats`))
      return false
    }
    if (looksLikeInstruction(fact.quote) || looksLikeInstruction(fact.claim)) {
      issues.push(issue('INJECTION_SUSPECT', path, 'text addressed to the model, kept out of the fact bank'))
      return false
    }
    if (!quoteIsVerbatim(fact.quote, pageText)) {
      issues.push(issue('QUOTE_NOT_VERBATIM', path, `quote not found in ${sourceId}: "${fact.quote.slice(0, 80)}"`))
      return false
    }
    seenRefs.add(fact.local_ref)
    return true
  })
  const factRefs = new Set(facts.map((fact) => fact.local_ref))
  const language_samples = extraction.language_samples.filter((sample, index) => {
    const path = `${sourceId}.language_samples[${index}]`
    if (!quoteIsVerbatim(sample.excerpt, pageText)) {
      issues.push(issue('QUOTE_NOT_VERBATIM', path, `excerpt not found in ${sourceId}: "${sample.excerpt.slice(0, 80)}"`))
      return false
    }
    return true
  })
  const audience_signals = extraction.audience_signals.map((signal, index) => {
    const fact_refs = signal.fact_refs.filter((ref) => {
      const ok = factRefs.has(ref)
      if (!ok) issues.push(issue('UNKNOWN_REF', `${sourceId}.audience_signals[${index}]`, `fact_ref ${ref} does not exist on this page`, 'repaired'))
      return ok
    })
    return { ...signal, fact_refs }
  })
  const dropped = issues.filter((i) => i.severity === 'dropped').length
  // A readable page with nothing verbatim is a misread, not an empty page: re-request.
  if (facts.length === 0 && extraction.facts.length > 0) throw new GateError(`page_extractor ${sourceId}`, issues)
  return { value: { ...extraction, facts, language_samples, audience_signals }, issues, kept: facts.length + language_samples.length, dropped }
}

type RawProofCards = z.infer<typeof proofBuilderResult>['data']['proof_cards']

/** Proof cards: cited facts exist; the variant rules hold ("no auto promotion"). */
export function gateProofCards(cards: RawProofCards, factIds: Set<string>, caseFactIds: Set<string>): Gated<RawProofCards> {
  const issues: GateIssue[] = []
  const value = cards.flatMap((card, index) => {
    const path = `proof_cards[${index}]`
    const fact_ids = card.fact_ids.map((id) => resolveId(id, factIds)).filter((id): id is string => id !== null)
    if (fact_ids.length === 0) {
      issues.push(issue('UNKNOWN_ID', path, `no cited fact exists (${card.fact_ids.join(', ')})`))
      return []
    }
    if (fact_ids.length < card.fact_ids.length) issues.push(issue('UNKNOWN_ID', path, 'some cited facts do not exist; kept the ones that do', 'repaired'))
    let next = { ...card, fact_ids }
    if (next.proof_type === 'measured_case') {
      const hasCaseEvidence = fact_ids.some((id) => caseFactIds.has(id))
      if (!next.actual_action || !next.observed_result || !hasCaseEvidence) {
        issues.push(issue('NO_AUTO_PROMOTION', path, 'measured_case needs an action, an observed result and case evidence; downgraded to declaration', 'repaired'))
        next = { ...next, proof_type: 'declaration', observed_result: null }
      }
    }
    if (next.proof_type === 'declaration' && next.observed_result) {
      issues.push(issue('ROI_WITHOUT_EVIDENCE', path, 'a declaration cannot carry an observed result; result removed', 'repaired'))
      next = { ...next, observed_result: null }
    }
    if (next.proof_type === 'observed_artifact' && !next.artifact_or_method) {
      issues.push(issue('NO_AUTO_PROMOTION', path, 'observed_artifact without an artifact; downgraded to declaration', 'repaired'))
      next = { ...next, proof_type: 'declaration' }
    }
    return [next]
  })
  if (value.length === 0 && cards.length > 0) throw new GateError('proof_builder', issues)
  return { value, issues, kept: value.length, dropped: cards.length - value.length }
}

type RawSeeds = z.infer<typeof contentSeederResult>['data']['content_bank']

/** Seeds: cited facts/proofs exist; a seed with no supported claim is not ready; near-duplicate angles are one seed. */
export function gateSeeds(seeds: RawSeeds, factIds: Set<string>, proofIds: Set<string>): Gated<RawSeeds> {
  const issues: GateIssue[] = []
  const kept: RawSeeds = []
  seeds.forEach((seed, index) => {
    const path = `content_bank[${index}]`
    const fact_ids = seed.source_claim_fact_ids.map((id) => resolveId(id, factIds)).filter((id): id is string => id !== null)
    const proof_ids = seed.proof_ids.map((id) => resolveId(id, proofIds)).filter((id): id is string => id !== null)
    if (fact_ids.length < seed.source_claim_fact_ids.length || proof_ids.length < seed.proof_ids.length) {
      issues.push(issue('UNKNOWN_ID', path, 'dropped citations that do not exist', 'repaired'))
    }
    const duplicate = kept.find((other) => wordSetSimilarity(other.angle, seed.angle) >= 0.8 && wordSetSimilarity(other.audience_question, seed.audience_question) >= 0.6)
    if (duplicate) {
      issues.push(issue('DUPLICATE_ANGLE', path, `same angle as "${duplicate.angle}"`))
      return
    }
    let readiness = seed.readiness
    let readiness_reason = seed.readiness_reason
    if (fact_ids.length === 0 && readiness === 'ready') {
      readiness = 'blocked'
      readiness_reason = 'no supported claim behind this angle'
      issues.push(issue('UNSUPPORTED_ANGLE', path, 'ready without any fact; marked blocked', 'repaired'))
    }
    kept.push({ ...seed, source_claim_fact_ids: fact_ids, proof_ids, readiness, readiness_reason })
  })
  return { value: kept, issues, kept: kept.length, dropped: seeds.length - kept.length }
}

type RawConflicts = z.infer<typeof conflictFinderResult>['data']['conflicts']

export function gateConflicts(conflicts: RawConflicts, factIds: Set<string>): Gated<RawConflicts> {
  const issues: GateIssue[] = []
  const value = conflicts.flatMap((conflict, index) => {
    const fact_ids = [...new Set(conflict.fact_ids.map((id) => resolveId(id, factIds)).filter((id): id is string => id !== null))]
    if (fact_ids.length < 2) {
      issues.push(issue('UNKNOWN_ID', `conflicts[${index}]`, 'a conflict needs two existing facts'))
      return []
    }
    return [{ ...conflict, fact_ids }]
  })
  return { value, issues, kept: value.length, dropped: conflicts.length - value.length }
}

type RawCoverage = z.infer<typeof coverageAssessorResult>['data']['coverage']

/** One row per requirement, evidence ids resolved; a missing requirement is `missing` with owner research, never omitted. */
export function gateCoverage(rows: RawCoverage, requirements: readonly (typeof coverageRequirements)[number][], knownIds: Set<string>): Gated<RawCoverage> {
  const issues: GateIssue[] = []
  const byRequirement = new Map<string, RawCoverage[number]>()
  rows.forEach((row, index) => {
    const evidence_ids = row.evidence_ids.map((id) => resolveId(id, knownIds)).filter((id): id is string => id !== null)
    if (evidence_ids.length < row.evidence_ids.length) issues.push(issue('UNKNOWN_ID', `coverage[${index}]`, 'dropped evidence ids that do not exist', 'repaired'))
    let readiness = row.readiness
    if (readiness === 'ready' && evidence_ids.length === 0) {
      readiness = 'blocked'
      issues.push(issue('UNSUPPORTED_READINESS', `coverage[${index}]`, `${row.requirement}: ready without evidence; marked blocked`, 'repaired'))
    }
    if (!byRequirement.has(row.requirement)) byRequirement.set(row.requirement, { ...row, evidence_ids, readiness })
  })
  const value = requirements.map((requirement) => {
    const row = byRequirement.get(requirement)
    if (row) return row
    issues.push(issue('MISSING_REQUIREMENT', 'coverage', `${requirement} not assessed; recorded as blocked`, 'repaired'))
    return { requirement, readiness: 'blocked' as const, evidence_ids: [], gap: 'not assessed by the coverage step', owner: 'research' as const }
  })
  return { value, issues, kept: value.length, dropped: 0 }
}

/**
 * Q-FREEZE capacity, computed by code: the bank must support `required` distinct,
 * ready angles. Distinctness = angles that are not near-duplicates; ready = readiness
 * ready with at least one fact behind the claim.
 */
export function planCapacity(seeds: ContentSeed[], required: number): Extract<CoverageItem, { item_type: 'plan_capacity' }> {
  const angles: Extract<CoverageItem, { item_type: 'plan_capacity' }>['supported_angles'] = []
  const unsupported: string[] = []
  for (const seed of seeds) {
    if (seed.source_claim.fact_ids.length === 0) {
      unsupported.push(seed.seed_id)
      continue
    }
    const duplicate = angles.find((angle) => wordSetSimilarity(angle.distinct_value, seed.angle) >= 0.8)
    if (duplicate) {
      duplicate.seed_ids.push(seed.seed_id)
      continue
    }
    angles.push({
      angle_id: `${seed.seed_id}-ANGLE`,
      audience_question: seed.audience_question,
      distinct_value: seed.angle,
      seed_ids: [seed.seed_id],
      fact_ids: seed.source_claim.fact_ids,
      proof_ids: seed.proof_ids,
      readiness: seed.readiness,
    })
  }
  const ready = angles.filter((angle) => angle.readiness === 'ready').length
  return {
    item_type: 'plan_capacity',
    required_topics: required,
    supported_angles: angles,
    distinct_count: angles.length,
    ready_count: ready,
    unsupported_angles: unsupported,
    readiness: ready >= required && angles.length >= required ? 'ready' : ready > 0 ? 'conditional' : 'blocked',
  }
}

/** Every id cited anywhere in a finished document must exist somewhere in it or its pinned inputs. */
export function collectCitedIds(value: unknown, out = new Map<string, string[]>(), path = ''): Map<string, string[]> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCitedIds(item, out, `${path}[${index}]`))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key
      if (/(^|_)ids?$/.test(key) || key === 'facts') {
        const ids = Array.isArray(child) ? child : typeof child === 'string' ? [child] : []
        for (const id of ids) if (typeof id === 'string') out.set(childPath, [...(out.get(childPath) ?? []), id])
        continue
      }
      collectCitedIds(child, out, childPath)
    }
  }
  return out
}

/** Singular `*_id` string values are the document's own identities (B01, G01, D01…), not citations. */
export function ownIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => ownIds(item, out))
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/_id$/.test(key) && typeof child === 'string') out.add(child)
      else ownIds(child, out)
    }
  }
  return out
}

export function unresolvedCitations(data: unknown, known: Set<string>): GateIssue[] {
  const issues: GateIssue[] = []
  const resolvable = new Set([...known, ...ownIds(data)])
  for (const [path, ids] of collectCitedIds(data)) {
    for (const id of ids) if (!resolvable.has(id)) issues.push(issue('UNRESOLVED_CITATION', path, `${id} is not a stored id`, 'blocking'))
  }
  return issues
}

/** The proof card fields the assembler needs to know exist. */
export type ProofCardLike = Pick<ProofCard, 'proof_id' | 'proof_type' | 'fact_ids'>
