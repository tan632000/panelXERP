import { Module } from '@nestjs/common';

import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';
import { ProductionUnitPort } from '@plugins/production/_shared/ports/production-unit.port';

/**
 * What production shares with the features that build on a finished cabinet: the port that locks
 * and lists cabinets and the registry of guards that may veto a finishing undo or a cancel. One
 * module, so every importer sees one registry instance.
 */
@Module({
  providers: [ProductionUnitPort, ProductionGuardRegistry],
  exports: [ProductionUnitPort, ProductionGuardRegistry],
})
export class ProductionSharedModule {}
