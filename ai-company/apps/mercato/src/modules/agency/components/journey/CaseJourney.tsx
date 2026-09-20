'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'
import { clientCaseTasksSchema } from '@/modules/agency_operations/lib/clientCaseTasks/contracts'
import { clientCaseItemSchema } from '@/modules/agency_operations/lib/contracts/clientCaseQuery'

const AgencyTaskPage = dynamic(() => import('../AgencyTaskPage'))

/**
 * One order, one axis (the eight steps of the v2 prototype): research, brief,
 * strategy + ToV, plan, post in production, post text, publication, package.
 * Every state is read from what the platform persisted — the order's client
 * documents, the open customer tasks and the research task runs. The current
 * decision is the existing task page embedded under the axis; nothing here
 * approves anything and no state is inferred from a URL. The second
 * perspective shows, per step, which agents ran and how many QA rounds it
 * took — ids and outcomes only, the same data the progress API exposes.
 */

type Perspective = 'client' | 'agents'
type StepState = 'done' | 'current' | 'working' | 'upcoming'
type StepId = 'research' | 'brief' | 'strategy' | 'plan' | 'prod' | 'post' | 'publish' | 'close'

type DocumentRow = { output_id: string; version: string | null; status: string; simulation: boolean; has_client_view: boolean }
type ProgressRun = { step_id: string; attempt: number; status: string; runner: string; verdict: string | null; started_at: string; finished_at: string | null; agents: { agent_id: string; status: string }[] }
type TaskDetail = { ok: boolean; task?: { id: string; taskName: string; status: string }; formKey?: string | null }
type BriefQuestion = { question_id: string; question: string; hint: string; priority: string }

type StepDefinition = { id: StepId; code: string; formKeys: string[]; documents: string[]; researchSteps: string[]; decision: boolean }

const STEPS: StepDefinition[] = [
  { id: 'research', code: '3.1 – 3.8', formKeys: [], documents: [], researchSteps: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8'], decision: false },
  { id: 'brief', code: '4.1 – 4.7', formKeys: ['agency.brief-review'], documents: ['KLI-BRIEF'], researchSteps: ['4.1', '4.2'], decision: true },
  { id: 'strategy', code: '5.2 – 5.8', formKeys: ['agency.strategy-pair-review'], documents: ['KLI-STRATEGIA', 'KLI-TOV'], researchSteps: ['5.1', '5.2', '5.3', '5.4'], decision: true },
  { id: 'plan', code: '6.2 – 6.7', formKeys: ['agency.plan-review'], documents: ['KLI-PLAN'], researchSteps: ['6.1', '6.2', '6.3', '6.5', '6.7'], decision: true },
  { id: 'prod', code: '7.2 – 7.3', formKeys: [], documents: [], researchSteps: ['7.1', '7.2', '7.3'], decision: false },
  { id: 'post', code: '7.4 – 7.6', formKeys: ['agency.post-review'], documents: ['KLI-POST'], researchSteps: [], decision: true },
  { id: 'publish', code: '8.2 – 8.7', formKeys: ['agency.publication-consent'], documents: [], researchSteps: ['8.2', '8.3', '8.7'], decision: true },
  { id: 'close', code: '9.1 – 9.3', formKeys: [], documents: ['KLI-PAKIET'], researchSteps: ['9.1', '9.3'], decision: true },
]

const APPROVED = new Set(['approved', 'accepted', 'published', 'closed'])
const FINISHED = new Set(['done', 'to_fix', 'exception'])

function docsOf(step: StepDefinition, documents: DocumentRow[]): DocumentRow[] {
  return documents.filter((doc) => step.documents.some((id) => doc.output_id.startsWith(id)))
}

function stateOf(step: StepDefinition, documents: DocumentRow[], runs: ProgressRun[], currentTask: { formKey: string | null } | null, laterReached: boolean): StepState {
  if (currentTask?.formKey && step.formKeys.includes(currentTask.formKey)) return 'current'
  const docs = docsOf(step, documents)
  const stepRuns = runs.filter((run) => step.researchSteps.includes(run.step_id))
  if (laterReached) return 'done'
  if (docs.length > 0 && docs.every((doc) => APPROVED.has(doc.status))) return 'done'
  if (!step.decision) {
    if (stepRuns.some((run) => run.status === 'running')) return 'working'
    const last = stepRuns[stepRuns.length - 1]
    if (last && FINISHED.has(last.status) && step.researchSteps.includes(last.step_id) && last.step_id === step.researchSteps[step.researchSteps.length - 1]) return 'done'
    if (step.id === 'prod' && documents.some((doc) => doc.output_id.startsWith('KLI-POST'))) return 'done'
    return stepRuns.length > 0 ? 'working' : 'upcoming'
  }
  if (stepRuns.some((run) => run.status === 'running')) return 'working'
  if (docs.length > 0 && docs.some((doc) => doc.status === 'ready_for_review')) return 'current'
  if (docs.length > 0 || stepRuns.length > 0) return 'working'
  return 'upcoming'
}

const tones: Record<StepState, string> = {
  done: 'border-status-success-border bg-status-success-bg text-status-success-text',
  current: 'border-status-info-border bg-status-info-bg text-status-info-text',
  working: 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
  upcoming: 'border-border bg-card text-muted-foreground',
}

export function CaseJourney({ orgSlug, caseId }: { orgSlug: string; caseId: string }) {
  const t = useT()
  const [perspective, setPerspective] = React.useState<Perspective>('client')
  const [caseTitle, setCaseTitle] = React.useState<string | null>(null)
  const [documents, setDocuments] = React.useState<DocumentRow[]>([])
  const [runs, setRuns] = React.useState<ProgressRun[]>([])
  const [questions, setQuestions] = React.useState<BriefQuestion[]>([])
  const [currentTask, setCurrentTask] = React.useState<{ id: string; title: string; formKey: string | null } | null>(null)
  const [selected, setSelected] = React.useState<StepId | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const generation = React.useRef(0)

  const load = React.useCallback(async () => {
    const current = ++generation.current
    setFailed(false)
    try {
      const [caseResponse, documentsResponse, tasksResponse, progressResponse, briefResponse] = await Promise.all([
        apiCall<unknown>(`/api/agency/portal/cases/${encodeURIComponent(caseId)}`),
        apiCall<{ documents?: DocumentRow[] }>(`/api/agency_research/portal/documents?order_ref=${encodeURIComponent(caseId)}`),
        apiCall<unknown>(`/api/agency/portal/cases/${encodeURIComponent(caseId)}/tasks`),
        apiCall<{ runs?: ProgressRun[] }>(`/api/agency_research/portal/progress?order_ref=${encodeURIComponent(caseId)}`),
        apiCall<{ questions?: BriefQuestion[] }>(`/api/agency_research/portal/brief?order_ref=${encodeURIComponent(caseId)}`),
      ])
      if (current !== generation.current) return
      if (!caseResponse.ok) { setFailed(true); return }
      const parsedCase = clientCaseItemSchema.safeParse(caseResponse.result)
      setCaseTitle(parsedCase.success ? parsedCase.data.title : null)
      setDocuments(documentsResponse.ok ? (documentsResponse.result?.documents ?? []) : [])
      setRuns(progressResponse.ok ? (progressResponse.result?.runs ?? []) : [])
      setQuestions(briefResponse.ok ? (briefResponse.result?.questions ?? []) : [])
      const tasks = tasksResponse.ok ? clientCaseTasksSchema.safeParse(tasksResponse.result) : null
      const open = tasks?.success ? tasks.data.tasks.find((task) => task.assignedToYou) ?? tasks.data.tasks[0] ?? null : null
      if (!open) { setCurrentTask(null); return }
      const detail = await apiCall<TaskDetail>(`/api/workflows/portal/tasks/${encodeURIComponent(open.id)}`)
      if (current !== generation.current) return
      setCurrentTask({ id: open.id, title: open.title, formKey: detail.ok ? detail.result?.formKey ?? null : null })
    } catch {
      if (current === generation.current) setFailed(true)
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [caseId])

  React.useEffect(() => {
    void load()
    return () => { generation.current += 1 }
  }, [load])
  usePortalAppEvent('workflows.task.portal_assigned', () => { void load() }, [load])
  usePortalAppEvent('agency.*', () => { void load() }, [load])

  const states = React.useMemo(() => {
    const result = {} as Record<StepId, StepState>
    for (let index = STEPS.length - 1; index >= 0; index -= 1) {
      const step = STEPS[index]
      const laterReached = STEPS.slice(index + 1).some((later) => result[later.id] === 'done' || result[later.id] === 'current')
      result[step.id] = stateOf(step, documents, runs, currentTask, laterReached)
    }
    return result
  }, [documents, runs, currentTask])

  const activeStep = STEPS.find((step) => states[step.id] === 'current') ?? STEPS.find((step) => states[step.id] === 'working') ?? null
  const shownStep = STEPS.find((step) => step.id === selected) ?? activeStep ?? STEPS[0]
  const decisions = STEPS.filter((step) => step.decision).length
  const back = (
    <Button type="button" asChild variant="outline">
      <Link href={`/${encodeURIComponent(orgSlug)}/portal/agency/cases/${encodeURIComponent(caseId)}`}>{t('agency.cases.open')}</Link>
    </Button>
  )

  if (loading) return <LoadingMessage label={t('agency.journey.loading')} />
  if (failed) return <ErrorMessage label={t('agency.journey.loadError')} />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PortalPageHeader
        label={caseTitle ?? undefined}
        title={perspective === 'client' ? t('agency.journey.title') : t('agency.journey.orchestratorTitle')}
        description={perspective === 'client' ? t('agency.journey.description', { decisions: String(decisions), total: String(STEPS.length) }) : t('agency.journey.orchestratorDescription')}
        action={back}
      />
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('agency.journey.perspective')}>
        {(['client', 'agents'] as Perspective[]).map((option) => (
          <Button key={option} type="button" role="tab" size="sm" aria-selected={perspective === option} variant={perspective === option ? 'default' : 'outline'} onClick={() => setPerspective(option)}>
            {t(`agency.journey.perspective.${option}`)}
          </Button>
        ))}
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('agency.journey.axis')}>
        {STEPS.map((step, index) => {
          const state = states[step.id]
          const isShown = shownStep.id === step.id
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setSelected(step.id)}
                aria-current={state === 'current' ? 'step' : undefined}
                aria-pressed={isShown}
                className={`w-full rounded-lg border p-3 text-left transition-shadow hover:shadow-sm ${tones[state]} ${isShown ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
              >
                <div className="text-xs font-medium uppercase tracking-wide opacity-80">{index + 1} · {step.code}</div>
                <div className="mt-1 text-sm font-semibold">{t(`agency.journey.steps.${step.id}.label`)}</div>
                <div className="mt-0.5 text-xs">{t(`agency.journey.steps.${step.id}.sub`)}</div>
                <div className="mt-2 text-xs font-medium">{t(`agency.journey.state.${state}`)}</div>
              </button>
            </li>
          )
        })}
      </ol>

      {perspective === 'client' ? (
        <ClientStep step={shownStep} state={states[shownStep.id]} orgSlug={orgSlug} caseId={caseId} documents={documents} runs={runs} questions={questions} currentTask={currentTask} reload={load} />
      ) : (
        <AgentsView runs={runs} states={states} />
      )}
    </div>
  )
}

function ClientStep({ step, state, orgSlug, caseId, documents, runs, questions, currentTask, reload }: {
  step: StepDefinition; state: StepState; orgSlug: string; caseId: string; documents: DocumentRow[]; runs: ProgressRun[]; questions: BriefQuestion[]
  currentTask: { id: string; title: string; formKey: string | null } | null; reload: () => void
}) {
  const t = useT()
  const taskHere = currentTask?.formKey && step.formKeys.includes(currentTask.formKey) ? currentTask : null
  if (taskHere) return <AgencyTaskPage params={{ orgSlug, id: taskHere.id }} />

  const stepRuns = runs.filter((run) => step.researchSteps.includes(run.step_id) && run.runner !== 'system')
  const docs = docsOf(step, documents)
  const running = [...stepRuns].reverse().find((run) => run.status === 'running') ?? null
  const qaRuns = stepRuns.filter((run) => run.verdict !== null)
  const repairs = qaRuns.filter((run) => run.status === 'to_fix').length
  const lastQa = qaRuns[qaRuns.length - 1] ?? null

  return (
    <PortalCard>
      <PortalCardHeader
        label={`${step.code} · ${t(`agency.journey.state.${state}`)}`}
        title={t(`agency.journey.steps.${step.id}.label`)}
        description={t(`agency.journey.steps.${step.id}.intro`)}
      />
      <div className="mt-4 flex flex-col gap-4 text-sm">
        {step.id === 'research' ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t('agency.journey.research.sources')} value={String(new Set(stepRuns.filter((run) => run.step_id === '3.2' && FINISHED.has(run.status)).map((run) => run.step_id)).size > 0 ? t('agency.journey.research.collected') : t('agency.journey.research.pending'))} />
            <Stat label={t('agency.journey.research.qa')} value={lastQa ? t('agency.journey.research.qaValue', { verdict: t(`agency.journey.verdict.${verdictKey(lastQa.verdict)}`), repairs: String(repairs) }) : t('agency.journey.research.pending')} />
            <Stat label={t('agency.journey.research.questions')} value={questions.length > 0 ? t('agency.journey.research.questionsValue', { count: String(questions.length) }) : t('agency.journey.research.pending')} />
          </dl>
        ) : null}
        {step.id === 'research' ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t('agency.journey.research.rule1')}</li>
            <li>{t('agency.journey.research.rule2')}</li>
            <li>{t('agency.journey.research.rule3')}</li>
          </ul>
        ) : null}
        {step.id === 'prod' ? (
          <ol className="space-y-1">
            {stepRuns.map((run) => (
              <li key={`${run.step_id}-${run.attempt}-${run.started_at}`} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{run.step_id} · {t('agency.journey.attempt', { n: String(run.attempt) })}</span>
                <span>{run.verdict ? t(`agency.journey.verdict.${verdictKey(run.verdict)}`) : t(`agency.journey.runStatus.${runStatusKey(run.status)}`)}</span>
              </li>
            ))}
            {stepRuns.length === 0 ? <li className="text-muted-foreground">{t('agency.journey.notStarted')}</li> : null}
          </ol>
        ) : null}
        {docs.length > 0 ? (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li key={doc.output_id}>
                <DocumentPanel caseId={caseId} doc={doc} />
              </li>
            ))}
          </ul>
        ) : null}
        {running ? <p className="text-muted-foreground">{t('agency.journey.working', { step: running.step_id })}</p> : null}
        {state === 'upcoming' ? <p className="text-muted-foreground">{t('agency.journey.noDecisionHint')}</p> : null}
        {currentTask && !taskHere ? (
          <p>
            {t('agency.journey.taskElsewhere', { title: currentTask.title })}{' '}
            <Link className="underline underline-offset-4" href={`/${encodeURIComponent(orgSlug)}/portal/tasks/${encodeURIComponent(currentTask.id)}`}>{t('agency.journey.openTask')}</Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" asChild variant="outline"><Link href={`/${encodeURIComponent(orgSlug)}/portal/tasks`}>{t('agency.cases.openTasks')}</Link></Button>
          <Button type="button" asChild variant="outline"><Link href={`/${encodeURIComponent(orgSlug)}/portal/agency/materials?caseId=${encodeURIComponent(caseId)}`}>{t('agency.materials.link')}</Link></Button>
          <Button type="button" variant="outline" onClick={reload}>{t('agency.materials.refreshStatus')}</Button>
        </div>
      </div>
    </PortalCard>
  )
}

/** One client document of the order: status line, and the client view (markdown) on demand — the same projection the review tasks show. */
function DocumentPanel({ caseId, doc }: { caseId: string; doc: DocumentRow }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [markdown, setMarkdown] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const outputId = doc.output_id.replace(/@.*$/, '')
  React.useEffect(() => {
    if (!open || markdown !== null || !doc.has_client_view) return
    let cancelled = false
    void apiCall<{ client_view_md?: string | null }>(`/api/agency_research/portal/documents?order_ref=${encodeURIComponent(caseId)}&output=${encodeURIComponent(outputId)}`)
      .then((response) => { if (!cancelled) { if (response.ok) setMarkdown(response.result?.client_view_md ?? ''); else setFailed(true) } })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [open, markdown, doc.has_client_view, caseId, outputId])
  return (
    <div className="rounded-md border border-border bg-card">
      <button type="button" className="flex w-full flex-wrap items-baseline gap-2 px-3 py-2 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open} disabled={!doc.has_client_view}>
        <span className="font-medium">{outputId}</span>
        <span className="text-muted-foreground">{doc.version ? t('agency.journey.version', { version: doc.version }) : t('agency.journey.noVersion')} · {t(`agency.journey.docStatus.${docStatusKey(doc.status)}`)}</span>
        {doc.simulation ? <span className="rounded-md border border-status-warning-border bg-status-warning-bg px-1.5 text-xs text-status-warning-text">{t('agency.journey.simulation')}</span> : null}
        {doc.has_client_view ? <span className="ml-auto text-xs text-muted-foreground">{open ? t('agency.journey.document.hide') : t('agency.journey.document.show')}</span> : null}
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          {failed ? <p className="text-sm text-status-error-text">{t('agency.journey.document.loadError')}</p>
            : markdown === null ? <LoadingMessage label={t('agency.journey.loading')} />
            : <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{markdown}</ReactMarkdown></div>}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  )
}

function verdictKey(verdict: string | null): string {
  return verdict && ['ready', 'to_fix', 'exception', 'ready_for_approval', 'needs_client_data'].includes(verdict) ? verdict : 'other'
}
function runStatusKey(status: string): string {
  return ['running', 'done', 'failed', 'paused_budget', 'to_fix', 'exception'].includes(status) ? status : 'other'
}
function docStatusKey(status: string): string {
  return ['draft', 'ready_for_review', 'approved', 'blocked', 'accepted', 'published', 'closed'].includes(status) ? status : 'other'
}

function AgentsView({ runs, states }: { runs: ProgressRun[]; states: Record<StepId, StepState> }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      {STEPS.map((step) => {
        const stepRuns = runs.filter((run) => step.researchSteps.includes(run.step_id) && run.runner !== 'system')
        const agents = new Map<string, { ok: number; error: number }>()
        for (const run of stepRuns) for (const agent of run.agents) {
          const entry = agents.get(agent.agent_id) ?? { ok: 0, error: 0 }
          if (agent.status === 'ok') entry.ok += 1; else if (agent.status === 'error') entry.error += 1
          agents.set(agent.agent_id, entry)
        }
        const qaRuns = stepRuns.filter((run) => run.verdict !== null)
        const repairs = qaRuns.filter((run) => run.status === 'to_fix').length
        const lastQa = qaRuns[qaRuns.length - 1] ?? null
        return (
          <PortalCard key={step.id}>
            <PortalCardHeader
              label={`${step.code} · ${t(`agency.journey.state.${states[step.id]}`)}`}
              title={t(`agency.journey.steps.${step.id}.label`)}
              description={stepRuns.length === 0 ? (step.decision && step.researchSteps.length === 0 ? t('agency.journey.orchestrator.humanStep') : t('agency.journey.orchestrator.noRuns')) : t('agency.journey.orchestrator.summary', { runs: String(stepRuns.length), agents: String(agents.size) })}
            />
            {stepRuns.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">{t('agency.journey.orchestrator.col.step')}</th>
                      <th className="py-1 pr-3 font-medium">{t('agency.journey.orchestrator.col.attempt')}</th>
                      <th className="py-1 pr-3 font-medium">{t('agency.journey.orchestrator.col.agents')}</th>
                      <th className="py-1 pr-3 font-medium">{t('agency.journey.orchestrator.col.result')}</th>
                      <th className="py-1 font-medium">{t('agency.journey.orchestrator.col.time')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepRuns.map((run) => (
                      <tr key={`${run.step_id}-${run.attempt}-${run.started_at}`} className="border-t border-border align-top">
                        <td className="py-1 pr-3 font-mono">{run.step_id}</td>
                        <td className="py-1 pr-3 tabular-nums">{run.attempt}</td>
                        <td className="py-1 pr-3 font-mono">{run.agents.length > 0 ? [...new Set(run.agents.map((agent) => agent.agent_id.replace(/^agency_(research|tov)\./, '')))].join(', ') : t('agency.journey.orchestrator.codeOnly')}</td>
                        <td className="py-1 pr-3">{run.verdict ? t(`agency.journey.verdict.${verdictKey(run.verdict)}`) : t(`agency.journey.runStatus.${runStatusKey(run.status)}`)}</td>
                        <td className="py-1 tabular-nums">{durationLabel(run.started_at, run.finished_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {lastQa ? <p className="mt-3 text-sm text-muted-foreground">{t('agency.journey.orchestrator.qa', { verdict: t(`agency.journey.verdict.${verdictKey(lastQa.verdict)}`), repairs: String(repairs) })}</p> : null}
          </PortalCard>
        )
      })}
    </div>
  )
}

function durationLabel(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '…'
  const seconds = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`
}
