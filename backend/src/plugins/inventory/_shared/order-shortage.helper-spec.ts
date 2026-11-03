import { DataScopeService } from '@shared/services/data-scope.service';

import { OrderShortagePort } from '@plugins/inventory/_shared/ports/order-shortage.port';
import { MaterialService } from '@plugins/inventory/material/services/material.service';
import { OrderMaterialReadPort } from '@plugins/sales/_shared/ports/order-material-read.port';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { DataSource } from 'typeorm';

/**
 * The shortage port and the material view it must agree with, wired on a data source, for
 * specs of other plugins that may not reach the material service themselves. Named
 * `*.helper-spec.ts` so the build leaves it out and jest does not run it as a test.
 */
export function shortageKit(dataSource: DataSource) {
  const materials = new MaterialService(
    dataSource,
    new OrderMaterialReadPort(),
    new DataScopeService(),
  );
  return {
    materials,
    port: new OrderShortagePort(materials),
    /** The item's short as the material view of the order shows it. */
    async viewShort(
      orderId: number,
      itemId: number,
      actor: AuthUserPayload,
    ): Promise<number | undefined> {
      const view = await materials.findOrder(orderId, actor);
      return view.items.find((row) => row.itemId === itemId)?.short;
    },
  };
}
