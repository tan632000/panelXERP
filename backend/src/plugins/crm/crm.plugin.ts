import {
  getFeaturePermissions,
  runFeatureSeeds,
} from '@kernel/platform/features/feature-module.utils';

import { CRM_FEATURES } from '@plugins/crm/crm.features';
import { CrmModule } from '@plugins/crm/crm.module';

import type { ErpPlugin } from '@kernel/platform/plugins/plugin.contract';
import type { DataSource } from 'typeorm';

async function seedCrm(dataSource: DataSource): Promise<void> {
  await runFeatureSeeds(CRM_FEATURES, dataSource);
}

export const crmPlugin = {
  name: 'crm',
  module: CrmModule,
  permissions: getFeaturePermissions(CRM_FEATURES),
  seed: seedCrm,
} satisfies ErpPlugin;
