import { EstimateModule } from '@plugins/sales/estimate/estimate.module';
import { estimatePermissions } from '@plugins/sales/estimate/permissions/estimate.permissions';
import { requestPermissions } from '@plugins/sales/request/permissions/request.permissions';
import { RequestModule } from '@plugins/sales/request/request.module';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** Sales feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const SALES_FEATURES: ErpFeature[] = [
  {
    key: 'request',
    plugin: 'sales',
    module: RequestModule,
    permissions: requestPermissions,
  },
  {
    key: 'estimate',
    plugin: 'sales',
    module: EstimateModule,
    permissions: estimatePermissions,
    dependsOn: ['request'],
  },
];
