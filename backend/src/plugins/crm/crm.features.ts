import { ContactModule } from '@plugins/crm/contact/contact.module';
import { contactPermissions } from '@plugins/crm/contact/permissions/contact.permissions';
import { CustomerModule } from '@plugins/crm/customer/customer.module';
import { customerPermissions } from '@plugins/crm/customer/permissions/customer.permissions';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** CRM feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const CRM_FEATURES: ErpFeature[] = [
  {
    key: 'customer',
    plugin: 'crm',
    module: CustomerModule,
    permissions: customerPermissions,
  },
  {
    key: 'contact',
    plugin: 'crm',
    dependsOn: ['customer'],
    module: ContactModule,
    permissions: contactPermissions,
  },
];
