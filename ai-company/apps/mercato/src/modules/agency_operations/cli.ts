import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { configureAgencyTovProcess } from './lib/configureTovProcess'
import { configureNativeClientTriage } from './agents/client-triage/configureWorkflow'
import { readFile } from 'node:fs/promises'
import { configureAgencyAnalysisProcess } from './lib/analysisProcess'
import { restartAnalysisCase } from './lib/analysisProcess/restart'
import { configureEmployeeQuestionWorkflow } from './lib/employeeQuestions/configure'
import { configurePlanReviewWorkflow } from './lib/planReview/configure'
import { configurePostReviewWorkflow } from './lib/postReview/configure'
import { configureDemoPurchase } from './lib/orderBootstrap/configure'
import { configureDemoPurchaseWorkflow } from './lib/orderBootstrap/workflow'

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

const configureTriage: ModuleCli = {
  command: 'configure-triage',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!argv[index]?.startsWith('--') || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-triage --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const result = await configureNativeClientTriage(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const configureAnalysis: ModuleCli = {
  command: 'configure-analysis',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations configure-analysis --tenant <uuid> --organization <uuid> --user <granting-staff-uuid> --policy-file <approved-policy.json>'
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user', '--policy-file'].includes(argv[index]) || !argv[index + 1]) throw new Error(usage)
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const policyFile = options.get('policy-file')
    if (!policyFile) throw new Error(usage)
    const policy: unknown = JSON.parse(await readFile(policyFile, 'utf8'))
    const result = await configureAgencyAnalysisProcess(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'), policy,
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const configureEmployeeQuestions: ModuleCli = {
  command: 'configure-employee-questions',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user'].includes(argv[index]) || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-employee-questions --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const result = await configureEmployeeQuestionWorkflow(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const configurePlanReview: ModuleCli = {
  command: 'configure-plan-review',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user'].includes(argv[index]) || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-plan-review --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const container = await createRequestContainer()
    try {
      const result = await configurePlanReviewWorkflow(container, {
        tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
      })
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } finally { await container.dispose() }
  },
}

const configurePostReview: ModuleCli = {
  command: 'configure-post-review',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user'].includes(argv[index]) || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-post-review --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const container = await createRequestContainer()
    try {
      const result = await configurePostReviewWorkflow(container, {
        tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
      })
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } finally { await container.dispose() }
  },
}

const configurePurchase: ModuleCli = {
  command: 'configure-demo-purchase',
  async run(argv) {
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user'].includes(argv[index]) || !argv[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-demo-purchase --tenant <uuid> --organization <uuid> --user <granting-staff-uuid>')
      }
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const input = { tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user') }
    const container = await createRequestContainer()
    try {
      const configuration = await configureDemoPurchase(container, input)
      const workflow = await configureDemoPurchaseWorkflow(container, input)
      process.stdout.write(`${JSON.stringify({ configuration, workflow })}\n`)
    } finally { await container.dispose() }
  },
}

const resumeAnalysis: ModuleCli = {
  command: 'resume-analysis',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations resume-analysis --case <uuid> --tenant <uuid> --organization <uuid> --user <staff-uuid> [--from 3.2|3.5|3.8|4.2]'
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--case', '--tenant', '--organization', '--user', '--from'].includes(argv[index]) || !argv[index + 1]) throw new Error(usage)
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const container = await createRequestContainer()
    try {
      const result = await restartAnalysisCase(container, { caseId: options.get('case'), tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'), ...(options.get('from') ? { resumeFrom: options.get('from') } : {}) })
      process.stdout.write(`${JSON.stringify(result)}
`)
    } finally { await container.dispose() }
  },
}

export default [configureTov, configureTriage, configureAnalysis, configureEmployeeQuestions, configurePlanReview, configurePostReview, configurePurchase, resumeAnalysis]
