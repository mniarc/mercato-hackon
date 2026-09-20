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
import { configureSalesQuestions } from './lib/salesQuestions/configure'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyCase, AgencyClientSubmission } from './data/entities'
import { CLIENT_SUBMISSION_SERVICE, clientSubmissionRequestSchema, type ClientSubmissionService } from './lib/contracts/clientSubmission'
import { UserTask } from '@open-mercato/core/modules/workflows/data/entities'
import { completeUserTask } from '@open-mercato/core/modules/workflows/lib/task-handler'

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
    const republish = argv.includes('--republish')
    const args = argv.filter((arg) => arg !== '--republish')
    for (let index = 0; index < args.length; index += 2) {
      if (!args[index]?.startsWith('--') || !args[index + 1]) {
        throw new Error('[internal] Usage: agency_operations configure-triage --tenant <uuid> --organization <uuid> --user <granting-staff-uuid> [--tov-revision-policy-file <approved-policy.json>] [--republish]')
      }
      options.set(args[index].slice(2), args[index + 1])
    }
    const result = await configureNativeClientTriage(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'),
      ...(options.has('tov-revision-policy-file') ? { tovRevision: JSON.parse(await readFile(options.get('tov-revision-policy-file')!, 'utf8')) } : {}),
    }, { republish })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const configureAnalysis: ModuleCli = {
  command: 'configure-analysis',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations configure-analysis --tenant <uuid> --organization <uuid> --user <granting-staff-uuid> --policy-file <approved-policy.json> [--republish]'
    const options = new Map<string, string>()
    const republish = argv.includes('--republish')
    const args = argv.filter((arg) => arg !== '--republish')
    for (let index = 0; index < args.length; index += 2) {
      if (!['--tenant', '--organization', '--user', '--policy-file'].includes(args[index]) || !args[index + 1]) throw new Error(usage)
      options.set(args[index].slice(2), args[index + 1])
    }
    const policyFile = options.get('policy-file')
    if (!policyFile) throw new Error(usage)
    const policy: unknown = JSON.parse(await readFile(policyFile, 'utf8'))
    const result = await configureAgencyAnalysisProcess(await createRequestContainer(), {
      tenantId: options.get('tenant'), organizationId: options.get('organization'), userId: options.get('user'), policy,
    }, { republish })
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

/**
 * Operator recovery for submissions the portal stored while native intake was
 * unavailable (triage disabled or misconfigured): each one is re-submitted with its
 * immutable original under `startPending`, so the native workflow starts now and
 * the customer's words are never retyped. Submissions that already have a workflow
 * are left alone.
 */
const startPendingSubmissions: ModuleCli = {
  command: 'start-pending-submissions',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations start-pending-submissions --case <uuid>'
    if (argv[0] !== '--case' || !argv[1]) throw new Error(usage)
    const caseId = argv[1]
    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      const agencyCase = await em.findOne(AgencyCase, { id: caseId, deletedAt: null })
      if (!agencyCase) throw new Error('[internal] Case not found')
      const scope = { tenantId: agencyCase.tenantId, organizationId: agencyCase.organizationId }
      const pending = await findWithDecryption(em, AgencyClientSubmission, { ...scope, caseId, workflowInstanceId: null, deletedAt: null }, { orderBy: { createdAt: 'asc' } }, scope)
      const service = container.resolve<ClientSubmissionService>(CLIENT_SUBMISSION_SERVICE)
      const results: Array<{ submissionId: string; workflow: { status: string; currentStep: string } | null; replayed: boolean }> = []
      for (const submission of pending) {
        const original = clientSubmissionRequestSchema.parse(submission.original)
        const identity = { ...scope, customerEntityId: agencyCase.customerEntityId, customerUserId: submission.submittedByCustomerUserId }
        const result = await service.submit(identity, caseId, original, { requireNative: true, startPending: true })
        results.push({ submissionId: result.item.submissionId, workflow: result.item.workflow, replayed: result.replayed })
      }
      process.stdout.write(`${JSON.stringify({ caseId, pending: pending.length, results })}
`)
    } finally { await container.dispose() }
  },
}

/**
 * Operator nudge for a native instance left at an automated step after its
 * definition was republished (a transition the old definition lacked): the executor
 * re-reads the definition and evaluates the outgoing transitions once more.
 */
const continueInstance: ModuleCli = {
  command: 'continue-instance',
  async run(argv) {
    if (argv[0] !== '--instance' || !argv[1]) throw new Error('[internal] Usage: agency_operations continue-instance --instance <uuid>')
    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      const result = await container.resolve<{ executeWorkflow(em: EntityManager, container: unknown, instanceId: string): Promise<unknown> }>('workflowExecutor').executeWorkflow(em, container, argv[1])
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } finally { await container.dispose() }
  },
}

/**
 * Operator decision on a staff task from the CLI (an exception task's "obstacle
 * resolved", for example) — the same completion path the backend UI uses.
 */
const decideTask: ModuleCli = {
  command: 'decide-task',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations decide-task --task <uuid> --decision <decisionId> --user <staff-uuid>'
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--task', '--decision', '--user'].includes(argv[index]) || !argv[index + 1]) throw new Error(usage)
      options.set(argv[index].slice(2), argv[index + 1])
    }
    const taskId = options.get('task'); const decisionId = options.get('decision'); const userId = options.get('user')
    if (!taskId || !decisionId || !userId) throw new Error(usage)
    const container = await createRequestContainer()
    try {
      const em = container.resolve<EntityManager>('em')
      const task = await em.findOne(UserTask, { id: taskId })
      if (!task) throw new Error('[internal] Task not found')
      await completeUserTask(em, container, { taskId, userId, decisionId, formData: { triageRecoveryReason: 'operator retry after a transient provider error (response did not match schema)', triageRecoveryEvidence: 'agent_runs: agency_operations.client_triage error at 12:30:28; provider reachable, retried by operator' }, scope: { tenantId: task.tenantId, organizationId: task.organizationId } })
      process.stdout.write(`${JSON.stringify({ taskId, decisionId, status: 'completed' })}\n`)
    } finally { await container.dispose() }
  },
}

const configureSales: ModuleCli = {
  command: 'configure-sales-questions',
  async run(argv) {
    const usage = '[internal] Usage: agency_operations configure-sales-questions --tenant <uuid> --organization <uuid> --user <granting-staff-uuid> --allow-execution true'
    const options = new Map<string, string>()
    for (let index = 0; index < argv.length; index += 2) {
      if (!['--tenant', '--organization', '--user', '--allow-execution'].includes(argv[index]) || !argv[index + 1]) throw new Error(usage)
      options.set(argv[index].slice(2), argv[index + 1])
    }
    if (options.get('allow-execution') !== 'true') throw new Error(usage)
    const container = await createRequestContainer()
    try {
      const result = await configureSalesQuestions(container, { tenantId: options.get('tenant'), organizationId: options.get('organization'),
        userId: options.get('user'), allowExecution: true })
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } finally { await container.dispose() }
  },
}

export default [configureTov, configureTriage, configureAnalysis, configureEmployeeQuestions, configurePlanReview, configurePostReview, configurePurchase, resumeAnalysis, startPendingSubmissions, continueInstance, decideTask, configureSales]
