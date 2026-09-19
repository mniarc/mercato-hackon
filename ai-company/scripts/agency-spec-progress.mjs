export * from '../../.dev-docs/coverage/src/index.mjs'

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '../../.dev-docs/coverage/src/cli.mjs'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`Cannot read spec progress: ${error.message}`)
    process.exitCode = 1
  })
}
