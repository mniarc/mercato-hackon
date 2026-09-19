/** @jest-environment node */
import type { IntegrationDbClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { deleteNativeTriageFixtures } from '../nativeTriageCleanup'

test('cleans only the fixture workflow and its exact tenant-scoped triage runs', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'fixture-run' }] })
  await deleteNativeTriageFixtures({ query } as IntegrationDbClient, 'fixture-workflow', 'tenant', 'organization')
  expect(query.mock.calls[0][1]).toEqual(['fixture-workflow', 'tenant', 'organization', 'agency_operations.client_triage'])
  for (const [sql, params] of query.mock.calls.slice(1, -1)) {
    expect(sql).toContain('tenant_id = $2 AND organization_id = $3')
    expect(params).toEqual([['fixture-run'], 'tenant', 'organization'])
  }
  expect(query.mock.calls.at(-1)).toEqual([
    'DELETE FROM process_instances WHERE workflow_instance_id = $1 AND tenant_id = $2 AND organization_id = $3',
    ['fixture-workflow', 'tenant', 'organization'],
  ])
})

test('does not delete any run records when the fixture has no native runs', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] })
  await deleteNativeTriageFixtures({ query } as IntegrationDbClient, 'fixture-workflow', 'tenant', 'organization')
  expect(query).toHaveBeenCalledTimes(2)
  expect(query.mock.calls[1][0]).toContain('DELETE FROM process_instances')
})
