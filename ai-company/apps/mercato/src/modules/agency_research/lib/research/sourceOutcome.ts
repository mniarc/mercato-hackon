export class InsufficientSourceEvidenceError extends Error {
  readonly code = 'insufficient_source_evidence'
  persisted?: { taskRunIds: string[]; documentVersionIds: string[]; agentRunIds: string[]; spentPln: number }

  constructor(readonly sourceIds: string[], readonly attempts: {
    sourceId: string; url: string; access: string; limitation: string | null;
  }[] = []) {
    super('[internal] Research needs readable client sources before a grounded register can be produced')
    this.name = 'InsufficientSourceEvidenceError'
  }
}
