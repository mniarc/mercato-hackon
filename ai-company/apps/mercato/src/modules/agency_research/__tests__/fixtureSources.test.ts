/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'
import { orderDataSchema } from '../data/schemas/zamowienie'
import { configuredFixtureSources } from '../lib/research/fixtureSources'

const dir = path.resolve(__dirname, '../__fixtures__/flow')
const order = orderDataSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'order.json'), 'utf8')))
const original = { NODE_ENV: process.env.NODE_ENV, AGENCY_TEST_NATIVE_TRIAGE: process.env.AGENCY_TEST_NATIVE_TRIAGE,
  AGENCY_TEST_RESEARCH_FIXTURE_DIR: process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR,
  AGENCY_JOURNEY_INTELLIGENCE: process.env.AGENCY_JOURNEY_INTELLIGENCE,
  AGENCY_ALLOW_LIVE: process.env.AGENCY_ALLOW_LIVE }
beforeEach(() => Object.assign(process.env, { NODE_ENV: 'test', AGENCY_TEST_NATIVE_TRIAGE: '1', AGENCY_TEST_RESEARCH_FIXTURE_DIR: dir }))
afterEach(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })

it('provides the existing matching source corpus without requiring customer/internal source JSON', async () => {
  const sources = configuredFixtureSources(order)!
  expect(sources.pages).toEqual(['https://makeitflow.pl/index.php', 'https://makeitflow.pl/projekty/flowco-ai', 'https://makeitflow.pl/promocje-konsumenckie'])
  expect(sources.socialPosts).toEqual(JSON.parse(fs.readFileSync(path.join(dir, 'social.json'), 'utf8')).posts)
  expect(await sources.fetchPage(sources.pages![2])).toMatchObject({ status: 'unavailable', markdown: null })
})

it('does not attach the fixture corpus to another website or official profile', () => {
  expect(configuredFixtureSources({ ...order, brand: { ...order.brand, website_url: 'https://different.example/' } })).not.toHaveProperty('pages')
  expect(configuredFixtureSources({ ...order, official_social: { url: 'https://linkedin.com/company/different' } })?.socialPosts).toBeUndefined()
})

it('retains explicit nonproduction native-fixture guards', () => {
  Object.assign(process.env, { NODE_ENV: 'production' })
  expect(() => configuredFixtureSources(order)).toThrow('non-production runtime')
  Object.assign(process.env, { NODE_ENV: 'test', AGENCY_TEST_NATIVE_TRIAGE: '0' })
  expect(() => configuredFixtureSources(order)).toThrow('explicit authorized journey mode')
  delete process.env.AGENCY_TEST_RESEARCH_FIXTURE_DIR
  expect(configuredFixtureSources(order)).toBeNull()
})

it('allows bounded source fixtures for an explicitly authorized live-intelligence journey', () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    AGENCY_TEST_NATIVE_TRIAGE: '0',
    AGENCY_JOURNEY_INTELLIGENCE: 'live',
    AGENCY_ALLOW_LIVE: '1',
    AGENCY_TEST_RESEARCH_FIXTURE_DIR: dir,
  })
  expect(configuredFixtureSources(order)?.pages).toContain('https://makeitflow.pl/index.php')
  process.env.AGENCY_ALLOW_LIVE = '0'
  expect(() => configuredFixtureSources(order)).toThrow('explicit authorized journey mode')
})
