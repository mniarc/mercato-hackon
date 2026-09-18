export function buildAgencyMaterialFileUrl(caseId: string): string {
  return `/api/agency_operations/cases/${encodeURIComponent(caseId)}/material`
}
