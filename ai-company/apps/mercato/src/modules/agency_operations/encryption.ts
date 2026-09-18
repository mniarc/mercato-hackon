import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [{
  entityId: 'agency_operations:agency_client_submission',
  fields: [{ field: 'original' }],
}, {
  entityId: 'agency_operations:agency_client_reply',
  fields: [{ field: 'original' }],
}]

export default defaultEncryptionMaps
