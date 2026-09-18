import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'agency_operations',
  title: 'Agency Operations',
  version: '0.1.0',
  description: 'Client-facing agency cases executed by deterministic or agentic workers.',
  license: 'MIT',
  requires: ['attachments', 'customer_accounts', 'customers', 'workflows'],
}

export default metadata
