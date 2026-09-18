import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import AgencyAttentionContext from './widget.client'

const widget: InjectionWidgetModule = {
  metadata: {
    id: 'agency_operations.injection.attention-context',
    title: 'Agency case context',
    features: ['agency_operations.cases.view', 'workflows.instances.view'],
    priority: 40,
    enabled: true,
  },
  Widget: AgencyAttentionContext,
}

export default widget
