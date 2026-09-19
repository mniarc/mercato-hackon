import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIndex, readJournal, renderHtml } from './index.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('node .dev-docs/integrations/src/cli.mjs [--journal <JSONL file or directory>] [--map <JSON>] [--out <directory>]\nDefault map: integrations/expected.json. Default output: integrations/generated/. No journal means no runtime proof.')
} else {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    if (!['--journal', '--map', '--out'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Expected --journal, --map or --out followed by a path')
    options[args[index]] = resolve(args[index + 1])
  }
  const map = JSON.parse(await readFile(options['--map'] ?? resolve(root, 'expected.json'), 'utf8'))
  const journal = options['--journal'] ? await readJournal(options['--journal']) : { events: [], diagnostics: [] }
  const index = buildIndex(map, journal)
  const out = options['--out'] ?? resolve(root, 'generated')
  await mkdir(out, { recursive: true })
  await writeFile(resolve(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  await writeFile(resolve(out, 'generated-report.html'), renderHtml(index))
  console.log(`${index.agents.length} expected agents; ${index.integrations.length} handoffs; ${index.runs.length} observed runs; ${index.unmapped.length} unmapped events; ${index.diagnostics.length} malformed lines. Output: ${out}`)
}
