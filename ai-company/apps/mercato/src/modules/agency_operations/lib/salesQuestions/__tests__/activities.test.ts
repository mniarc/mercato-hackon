/** @jest-environment node */
import { validateSalesAnswer } from '../activities'
import { readSalesCatalogue } from '../configure'
import type { SavedSalesQuestion } from '../contracts'

const original: SavedSalesQuestion = { tenantId: 'tenant', organizationId: 'organization', customerUserId: 'customer', eventId: 'question',
  question: 'Please add a free audit to my price request', previousQuestionId: null, catalog: readSalesCatalogue() }
const interpretation = { parts: [{ intent: 'question', summary: 'Request for work outside the offer', rationale: 'Pre-purchase question', needsClarification: false, recommendedDisposition: 'refuse_extension' }],
  rationale: 'No work authorized', recommendedDisposition: 'refuse_extension', responseMessage: null }
const answer = { disposition: 'explain_catalog_boundary', message: 'This is a demo-only offer, not an authorization for an audit.',
  catalogVersionId: original.catalog.versionId, supportingCatalogPassages: ['No money is charged'], unresolvedQuestions: [] }

test('accepts a catalogue-grounded boundary explanation without treating G as permission to start work', () => {
  expect(validateSalesAnswer(original, interpretation, answer)).toEqual(answer)
  expect(() => validateSalesAnswer(original, interpretation, { ...answer, disposition: 'answer' })).toThrow('cannot authorize')
})

test('rejects invented catalogue evidence and a mismatched version', () => {
  expect(() => validateSalesAnswer(original, interpretation, { ...answer, supportingCatalogPassages: ['Includes a free audit'] })).toThrow('not grounded')
  expect(() => validateSalesAnswer(original, interpretation, { ...answer, catalogVersionId: 'other-version' })).toThrow('not grounded')
})
