import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import AgencyPortalPanel from './widget.client'

const widget: InjectionWidgetModule<{ orgSlug?: string }> = {
  metadata: {
    id: 'agency.injection.portal-panel',
    title: 'Twój panel',
    description: 'Studio Komunikacji client panel: progress, approvals, documents and order summary.',
    priority: 100,
    enabled: true,
  },
  Widget: AgencyPortalPanel,
}

export default widget
