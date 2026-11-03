import { productionIssuePermissions } from '@plugins/production/production-issue/permissions/production-issue.permissions';
import { ProductionIssueModule } from '@plugins/production/production-issue/production-issue.module';
import { productionOrderPermissions } from '@plugins/production/production-order/permissions/production-order.permissions';
import { ProductionOrderModule } from '@plugins/production/production-order/production-order.module';
import { progressPermissions } from '@plugins/production/progress/permissions/progress.permissions';
import { ProgressModule } from '@plugins/production/progress/progress.module';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** Production feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const PRODUCTION_FEATURES: ErpFeature[] = [
  {
    key: 'production-order',
    plugin: 'production',
    module: ProductionOrderModule,
    permissions: productionOrderPermissions,
  },
  {
    key: 'progress',
    plugin: 'production',
    module: ProgressModule,
    permissions: progressPermissions,
    dependsOn: ['production-order'],
  },
  {
    key: 'production-issue',
    plugin: 'production',
    module: ProductionIssueModule,
    permissions: productionIssuePermissions,
    dependsOn: ['progress'],
  },
];
