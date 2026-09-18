import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { configureAgencyTovProcess } from './lib/configureTovProcess'

const configureTov: ModuleCli = {
  command: 'configure-tov',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!argv[index]?.startsWith('--') || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-tov --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const result = await configureAgencyTovProcess(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

export default [configureTov]
