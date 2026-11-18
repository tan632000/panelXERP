import { getFeaturePermissions } from '@kernel/platform/features/feature-module.utils';

import { DELIVERY_FEATURES } from '@plugins/delivery/delivery.features';
import { DeliveryModule } from '@plugins/delivery/delivery.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';

export const deliveryPlugin = {
  name: 'delivery',
  dependsOn: ['sales', 'production'],
  module: DeliveryModule,
  permissions: getFeaturePermissions(DELIVERY_FEATURES),
} satisfies ErpPlugin;
