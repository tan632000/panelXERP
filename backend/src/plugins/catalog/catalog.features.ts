import { ItemModule } from '@plugins/catalog/item/item.module';
import { itemPermissions } from '@plugins/catalog/item/permissions/item.permissions';
import { LocationModule } from '@plugins/catalog/location/location.module';
import { locationPermissions } from '@plugins/catalog/location/permissions/location.permissions';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/** Catalog feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const CATALOG_FEATURES: ErpFeature[] = [
  {
    key: 'item',
    plugin: 'catalog',
    module: ItemModule,
    permissions: itemPermissions,
  },
  {
    key: 'location',
    plugin: 'catalog',
    module: LocationModule,
    permissions: locationPermissions,
  },
];
