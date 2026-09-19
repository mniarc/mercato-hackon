import { resolveTovIntelligence, TOV_CORRECTION_TEXT } from '../tovIntelligence'
import { tovBatchAnalystResult, tovProfileSynthesizerResult, tovBrandSynthesizerResult } from '../../../../../agency_tov/data/validators'

it('returns typed intelligence with the supplied source identity and verbatim quotes through every specialist stage', () => {
  const profile = { source: 'linkedin', profileUrl: 'https://example.test/profile', displayName: 'Fixture author', postCount: 1,
    firstPostedAt: '2026-01-01', lastPostedAt: '2026-01-01' }
  const text = 'The actual supplied post text.'
  const batch = tovBatchAnalystResult.parse(resolveTovIntelligence('agency_tov_batch_analyst', {
    profile, batch: { index: 0, total: 1 }, outputLanguage: 'en',
    posts: [{ id: 'actual-post', postedAt: '2026-01-01', text, media: 'none', likes: 0, comments: 0, shares: 0 }],
  }))
  const voice = tovProfileSynthesizerResult.parse(resolveTovIntelligence('agency_tov_profile_synthesizer', {
    profile, outputLanguage: 'en', observations: [{ batchIndex: 0, dateRange: { from: '2026-01-01', to: '2026-01-01' }, postCount: 1, observation: batch.data }],
  }))
  const brand = tovBrandSynthesizerResult.parse(resolveTovIntelligence('agency_tov_brand_synthesizer', {
    brand: 'Actual fixture brand', outputLanguage: 'en', profiles: [{ profile, voice: voice.data }],
  }))
  expect(brand.data.exemplars).toEqual([expect.objectContaining({ postId: 'actual-post', profileUrl: profile.profileUrl, quote: text })])
  expect(brand.data.qaChecklist.length).toBeGreaterThan(0)
  expect(resolveTovIntelligence('agency_research_tov_writer', {})).toBeUndefined()
  const corrected = tovBrandSynthesizerResult.parse(resolveTovIntelligence('agency_tov_brand_synthesizer', {
    brand: 'Actual fixture brand', outputLanguage: 'en', profiles: [{ profile, voice: voice.data }],
    correction: { previousVersion: '1.0', previous: brand.data, instructions: TOV_CORRECTION_TEXT, affectedFields: ['addressingTheReader'] },
  }))
  expect(corrected.data.addressingTheReader).not.toBe(brand.data.addressingTheReader)
  expect({ ...corrected.data, addressingTheReader: brand.data.addressingTheReader }).toEqual(brand.data)
})
