import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { CustomerAuthContext } from '@open-mercato/core/modules/customer_accounts/lib/customerAuth'
import {
  CLIENT_MATERIAL_INTAKE_SERVICE,
  type ClientMaterialIntakeService,
} from '@/modules/agency_operations/lib/contracts'

export async function submitPortalMaterial(
  container: AppContainer,
  auth: CustomerAuthContext & { customerEntityId: string },
  title: string,
  file: File,
) {
  const intake = container.resolve<ClientMaterialIntakeService>(CLIENT_MATERIAL_INTAKE_SERVICE)
  return intake.submitMaterial({
    identity: {
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      customerEntityId: auth.customerEntityId,
      customerUserId: auth.sub,
    },
    title,
    file: {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    },
  })
}
