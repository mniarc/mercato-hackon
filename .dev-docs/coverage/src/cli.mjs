import path from 'node:path'
import { defaultAppRoot, loadReport } from './scanner.mjs'
import { formatDetails, formatReport, refreshOutputs, selectHierarchy, writeHtmlReport } from './report.mjs'

export function parseOptions(args) {
  const options = { json: false, details: false, help: false, html: null, refresh: false }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (['--json', '--details', '--help', '--refresh'].includes(arg)) options[arg.slice(2)] = true
    else if (arg === '--html') options.html = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : true
    else if (arg === '--feature' || arg === '--story') {
      const value = args[++index]
      const pattern = arg === '--feature' ? /^F\d{2}$/ : /^F\d{2}-\d+$/
      if (!value || !pattern.test(value)) throw new Error(`${arg} needs ${arg === '--feature' ? 'Fnn' : 'Fnn-n'}.`)
      options[arg.slice(2)] = value
    } else throw new Error(`Unknown option ${arg}. Use --help.`)
  }
  if (options.feature && options.story) throw new Error('Choose --feature or --story, not both.')
  if (options.html && (options.json || options.details || options.feature || options.story || options.refresh)) throw new Error('Use --html on its own.')
  if (options.refresh && (options.json || options.details || options.feature || options.story)) throw new Error('Use --refresh on its own.')
  return options
}

function printHelp(output) {
  output.log('Manual assessments: .dev-docs/coverage/assessments/FNN.json, version 1, one feature per file. Edit these files for reviewed implementation/evidence/missing/proof/external-decision claims. Each stories[] entry has id and criteria[] with numbered AC IDs, implementation (implemented/partial/missing/unassessed), evidence [{path: App-relative, note}], missing[], externalDecision[], and verification {focused,nativeApp,liveModel}: passed/not_run/unknown. AC text comes from canonical specs. The scanner never changes assessments, calls AI, infers proof, or completes tasks.\n')
  output.log('Usage: node scripts/agency-spec-progress.mjs [--json] [--details | --feature Fnn | --story Fnn-n]\n       node scripts/agency-spec-progress.mjs --html [output-path]\n       node scripts/agency-spec-progress.mjs --refresh\n\n--refresh performs one scan and writes both deterministic machine inventory (.dev-docs/coverage/generated/inventory.json) and the self-contained report (.dev-docs/coverage/generated-report.html). --html writes only the report and otherwise preserves existing behavior; its default is generated-report.html. Relative custom HTML paths resolve from the current directory. Generator source and focused tests are colocated in .dev-docs/coverage/src/.\n\nDone task evidence is not story completion. Implementation, focused proof, native-app/fixture proof and live-model proof remain separate. Exact assessment inputs are edited manually; routine refresh needs no model.')
}

export async function runCli(args, output = console) {
  const options = parseOptions(args)
  if (options.help) {
    printHelp(output)
    return
  }
  const report = await loadReport()
  const focused = options.feature || options.story
  if (options.refresh) {
    const outputs = await refreshOutputs(report)
    output.log(`Wrote ${outputs.inventoryPath}`)
    output.log(`Wrote ${outputs.htmlPath}`)
  } else if (options.html) {
    const outputPath = options.html === true ? path.join(defaultAppRoot, '.dev-docs', 'coverage', 'generated-report.html') : path.resolve(options.html)
    output.log(`Wrote ${await writeHtmlReport(report, outputPath)}`)
  } else if (options.json) output.log(JSON.stringify(focused ? selectHierarchy(report, options) : report, null, 2))
  else output.log(focused || options.details ? formatDetails(selectHierarchy(report, options)) : formatReport(report))
}
