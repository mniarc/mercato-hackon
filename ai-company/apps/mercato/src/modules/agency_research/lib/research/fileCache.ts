import fs from 'node:fs'
import path from 'node:path'
import type { PipelineCache } from './pipeline'

/**
 * The pipeline cache on disk, one JSON file per agent-call fingerprint. Grounded
 * outputs only are stored (the step runner judges a cached value again on read),
 * so a resume or a QA repair pays only for the calls whose input actually changed.
 */
export function fileCache(dir: string): PipelineCache {
  fs.mkdirSync(dir, { recursive: true })
  const fileFor = (key: string) => path.join(dir, `${key.replace(/[^a-z0-9_.-]+/gi, '_')}.json`)
  return {
    async get(key) {
      const file = fileFor(key)
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    },
    async set(key, value) {
      fs.writeFileSync(fileFor(key), JSON.stringify(value, null, 2))
    },
  }
}

/** Where the in-app runs keep their cache: per order, under the app's `.mercato` state directory unless overridden. */
export function orderCacheDir(orderRef: string): string {
  const root = process.env.OM_AGENCY_RESEARCH_CACHE_DIR ?? path.join(process.cwd(), '.mercato', 'agency-research', 'cache')
  return path.join(root, orderRef.replace(/[^a-z0-9_.-]+/gi, '_'))
}
