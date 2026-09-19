'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'

/**
 * The staff view of one order as the eight steps of the process, each a
 * rollup of the persisted task runs behind it: attempts, agent calls, cost,
 * the last QA verdict and its findings, the escalation record when 3.7 ran
 * out of rounds. Same data as the ledger below; this is the map on top of it.
 */

export type StepsAsCodeRun = {
  id: string; stepId: string; attempt: number; status: string; runner: string
  costPln: number; agentRuns: number; outputVersionId: string | null
  error: string | null; qaResult?: unknown; createdAt: string; finishedAt: string | null
}
export type StepsAsCodeAgentRun = { id: string; agentId: string; stepId: string | null; status: string; createdAt: string }

type StepId = 'research' | 'brief' | 'strategy' | 'plan' | 'prod' | 'post' | 'publish' | 'close'
type QaFinding = { code?: string; path?: string; severity?: string; gap?: string; owner?: string; fix_step?: string | null }
type QaResult = { verdict?: string; summary?: string; findings?: QaFinding[] }

const STEPS: { id: StepId; code: string; researchSteps: string[]; decision: boolean; qaStep: string | null }[] = [
  { id: 'research', code: '3.1 – 3.8', researchSteps: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', 'E.1'], decision: false, qaStep: '3.7' },
  { id: 'brief', code: '4.1 – 4.7', researchSteps: ['4.1', '4.2'], decision: true, qaStep: '4.2' },
  { id: 'strategy', code: '5.2 – 5.8', researchSteps: ['5.1', '5.2', '5.3', '5.4'], decision: true, qaStep: '5.4' },
  { id: 'plan', code: '6.2 – 6.7', researchSteps: ['6.1', '6.2', '6.3', '6.5', '6.7'], decision: true, qaStep: '6.3' },
  { id: 'prod', code: '7.2 – 7.3', researchSteps: ['7.1', '7.2', '7.3'], decision: false, qaStep: '7.3' },
  { id: 'post', code: '7.4 – 7.6', researchSteps: [], decision: true, qaStep: null },
  { id: 'publish', code: '8.2 – 8.7', researchSteps: ['8.2', '8.3', '8.7'], decision: true, qaStep: null },
  { id: 'close', code: '9.1 – 9.3', researchSteps: ['9.1', '9.3'], decision: true, qaStep: null },
]

const key = 'agencyResearch.orders.detail.steps'

function qaOf(run: StepsAsCodeRun): QaResult | null {
  const value = run.qaResult
  return value && typeof value === 'object' ? (value as QaResult) : null
}

function verdictVariant(verdict: string | null | undefined): StatusBadgeVariant {
  if (!verdict) return 'neutral'
  if (verdict === 'ready' || verdict === 'ready_for_approval') return 'success'
  if (verdict === 'to_fix' || verdict === 'needs_client_data') return 'warning'
  return 'error'
}

function severityVariant(severity: string | undefined): StatusBadgeVariant {
  if (severity === 'blocking') return 'error'
  if (severity === 'major') return 'warning'
  return 'neutral'
}

export function StepsAsCode({ runs, agentRuns, totalPln }: { runs: StepsAsCodeRun[]; agentRuns: StepsAsCodeAgentRun[]; totalPln: number }) {
  const translate = useT()
  const [selected, setSelected] = React.useState<StepId>('research')
  const rollups = React.useMemo(() => STEPS.map((step) => {
    const stepRuns = runs.filter((run) => step.researchSteps.includes(run.stepId))
    const modelRuns = stepRuns.filter((run) => run.runner !== 'system')
    const calls = agentRuns.filter((run) => run.stepId !== null && step.researchSteps.includes(run.stepId))
    const qaRuns = stepRuns.filter((run) => run.stepId === step.qaStep && qaOf(run))
    const lastQa = qaRuns[qaRuns.length - 1] ?? null
    const repairs = qaRuns.filter((run) => run.status === 'to_fix').length
    const escalation = stepRuns.find((run) => run.stepId === 'E.1') ?? null
    const cost = modelRuns.reduce((sum, run) => sum + run.costPln, 0)
    const running = stepRuns.some((run) => run.status === 'running')
    const reached = stepRuns.length > 0
    return { step, stepRuns, modelRuns, calls, lastQa, repairs, escalation, cost, running, reached }
  }), [runs, agentRuns])
  const current = rollups.find((entry) => entry.step.id === selected) ?? rollups[0]
  const lastQaResult = current.lastQa ? qaOf(current.lastQa) : null
  const findings = lastQaResult?.findings ?? []

  return (
    <section className="space-y-4 rounded-lg border bg-card p-6">
      <SectionHeader title={translate(`${key}.title`)} />
      <p className="text-sm text-muted-foreground">{translate(`${key}.description`, { total: totalPln.toFixed(2) })}</p>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label={translate(`${key}.axis`)}>
        {rollups.map(({ step, modelRuns, cost, running, reached, lastQa }, index) => {
          const active = step.id === selected
          const qa = lastQa ? qaOf(lastQa) : null
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setSelected(step.id)}
                aria-pressed={active}
                className={`w-full rounded-md border p-3 text-left ${active ? 'border-ring bg-muted' : 'border-border bg-background hover:bg-muted/50'}`}
              >
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{index + 1} · {step.code}</div>
                <div className="mt-1 text-sm font-semibold">{translate(`${key}.labels.${step.id}`)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {reached
                    ? translate(`${key}.rollup`, { runs: modelRuns.length, cost: cost.toFixed(2) })
                    : step.decision && step.researchSteps.length === 0 ? translate(`${key}.humanStep`) : translate(`${key}.notReached`)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {running ? <StatusBadge variant="info">{translate(`${key}.running`)}</StatusBadge> : null}
                  {qa?.verdict ? <StatusBadge variant={verdictVariant(qa.verdict)}>{qa.verdict}</StatusBadge> : null}
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="space-y-4 rounded-md border border-border bg-background p-4">
        <SectionHeader title={`${current.step.code} · ${translate(`${key}.labels.${current.step.id}`)}`} />
        {current.stepRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{current.step.decision && current.step.researchSteps.length === 0 ? translate(`${key}.humanStep`) : translate(`${key}.notReached`)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">{translate(`${key}.col.step`)}</th>
                  <th className="py-1 pr-3 font-medium">{translate(`${key}.col.attempt`)}</th>
                  <th className="py-1 pr-3 font-medium">{translate(`${key}.col.agents`)}</th>
                  <th className="py-1 pr-3 font-medium">{translate(`${key}.col.result`)}</th>
                  <th className="py-1 pr-3 font-medium">{translate(`${key}.col.cost`)}</th>
                  <th className="py-1 font-medium">{translate(`${key}.col.time`)}</th>
                </tr>
              </thead>
              <tbody>
                {current.stepRuns.map((run) => {
                  const calls = agentRuns.filter((call) => call.stepId === run.stepId && call.createdAt >= run.createdAt && (!run.finishedAt || call.createdAt <= run.finishedAt))
                  const agents = [...new Set(calls.map((call) => call.agentId.replace(/^agency_(research|tov)\./, '')))]
                  const qa = qaOf(run)
                  return (
                    <tr key={run.id} className="border-t border-border align-top">
                      <td className="py-1 pr-3 font-mono text-xs">{run.stepId}</td>
                      <td className="py-1 pr-3 tabular-nums">{run.attempt}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{run.runner === 'system' ? translate(`${key}.codeOnly`) : agents.length > 0 ? agents.join(', ') : run.agentRuns > 0 ? translate(`${key}.cachedCalls`, { count: run.agentRuns }) : '—'}</td>
                      <td className="py-1 pr-3"><StatusBadge variant={qa?.verdict ? verdictVariant(qa.verdict) : run.status === 'done' ? 'success' : run.status === 'running' ? 'info' : run.status === 'failed' || run.status === 'exception' ? 'error' : 'warning'}>{qa?.verdict ?? run.status}</StatusBadge>{run.error ? <div className="mt-1 max-w-md text-xs text-muted-foreground">{run.error}</div> : null}</td>
                      <td className="py-1 pr-3 tabular-nums">{run.costPln.toFixed(2)}</td>
                      <td className="py-1 tabular-nums text-xs">{duration(run.createdAt, run.finishedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {lastQaResult ? (
          <div className="space-y-2">
            <SectionHeader title={translate(`${key}.findings.title`, { step: current.step.qaStep ?? '', verdict: lastQaResult.verdict ?? '', repairs: current.repairs })} />
            {lastQaResult.summary ? <p className="text-sm text-muted-foreground">{lastQaResult.summary}</p> : null}
            {findings.length === 0 ? <p className="text-sm text-muted-foreground">{translate(`${key}.findings.empty`)}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">{translate(`${key}.findings.severity`)}</th>
                      <th className="py-1 pr-3 font-medium">{translate(`${key}.findings.owner`)}</th>
                      <th className="py-1 pr-3 font-medium">{translate(`${key}.findings.path`)}</th>
                      <th className="py-1 font-medium">{translate(`${key}.findings.gap`)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((finding, index) => (
                      <tr key={`${finding.path ?? ''}-${index}`} className="border-t border-border align-top">
                        <td className="py-1 pr-3"><StatusBadge variant={severityVariant(finding.severity)}>{finding.severity ?? '—'}</StatusBadge></td>
                        <td className="py-1 pr-3 font-mono text-xs">{finding.owner ?? '—'}{finding.fix_step ? ` → ${finding.fix_step}` : ''}</td>
                        <td className="py-1 pr-3 font-mono text-xs">{finding.path ?? '—'}<div className="text-muted-foreground">{finding.code ?? ''}</div></td>
                        <td className="py-1 text-xs">{finding.gap ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {current.escalation ? (
          <div className="rounded-md border border-status-error-border bg-status-error-bg p-3 text-sm text-status-error-text">
            <div className="font-semibold">{translate(`${key}.escalation.title`)}</div>
            <div className="mt-1 text-xs">{current.escalation.error ?? translate(`${key}.escalation.noReason`)}</div>
          </div>
        ) : null}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{translate(`${key}.mechanism.title`)}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            {(['input', 'budget', 'cache', 'agent', 'zod', 'gate', 'version'] as const).map((item) => <li key={item}>{translate(`${key}.mechanism.${item}`)}</li>)}
          </ol>
        </details>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelected('research')}>{translate(`${key}.reset`)}</Button>
        </div>
      </div>
    </section>
  )
}

function duration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '…'
  const seconds = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`
}
