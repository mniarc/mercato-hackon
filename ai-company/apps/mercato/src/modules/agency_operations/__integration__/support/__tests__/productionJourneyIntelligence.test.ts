/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'
import { createProductionJourneyIntelligence } from '../productionJourney/intelligence'

test('extractor intelligence follows the actual page when an uploaded source shifts native source IDs', async () => {
  const appRoot = path.resolve(__dirname, '../../../../../..')
  const sources = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow')
  const intelligence = createProductionJourneyIntelligence(appRoot)
  const page = {
    source_id: 'S-08',
    url: 'https://northlight.example/',
    content_md: fs.readFileSync(path.join(sources, 'pages/northlight.md'), 'utf8'),
  }

  const result = await intelligence.resolveStructured({
    formatName: 'agency_research_page_extractor', userTexts: [JSON.stringify({ page })],
  })

  expect(result).toEqual(JSON.parse(fs.readFileSync(path.join(sources, 'canned/agency_research.page_extractor.S-07.json'), 'utf8')))
  expect(page.source_id).toBe('S-08')
})
