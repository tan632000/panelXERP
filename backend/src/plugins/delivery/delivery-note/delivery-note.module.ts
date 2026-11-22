import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';

import { DELIVERY_NOTE_GUARD_NAME } from '@plugins/delivery/delivery-note/constants/delivery-note.constant';
import { DeliveryNoteFileController } from '@plugins/delivery/delivery-note/delivery-note-file.controller';
import { DeliveryNoteController } from '@plugins/delivery/delivery-note/delivery-note.controller';
import { DeliveryNoteFile } from '@plugins/delivery/delivery-note/entities/delivery-note-file.entity';
import { DeliveryNoteUnit } from '@plugins/delivery/delivery-note/entities/delivery-note-unit.entity';
import { DeliveryNote } from '@plugins/delivery/delivery-note/entities/delivery-note.entity';
import { DeliveryNoteAccess } from '@plugins/delivery/delivery-note/services/delivery-note-access.service';
import { DeliveryNoteFileService } from '@plugins/delivery/delivery-note/services/delivery-note-file.service';
import { deliveryNoteGuards } from '@plugins/delivery/delivery-note/services/delivery-note-guards';
import { DeliveryNoteQueryService } from '@plugins/delivery/delivery-note/services/delivery-note-query.service';
import { DeliveryNoteService } from '@plugins/delivery/delivery-note/services/delivery-note.service';
import { ProductionGuardRegistry } from '@plugins/production/_shared/ports/production-guard.registry';
import { ProductionSharedModule } from '@plugins/production/_shared/production-shared.module';
import { SalesSharedModule } from '@plugins/sales/_shared/sales-shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeliveryNote,
      DeliveryNoteUnit,
      DeliveryNoteFile,
    ]),
    AuditModule,
    SalesSharedModule,
    ProductionSharedModule,
  ],
  controllers: [DeliveryNoteController, DeliveryNoteFileController],
  providers: [
    DeliveryNoteAccess,
    DeliveryNoteQueryService,
    DeliveryNoteService,
    DeliveryNoteFileService,
  ],
})
export class DeliveryNoteModule implements OnModuleInit {
  constructor(private readonly guards: ProductionGuardRegistry) {}

  /** From now on production asks the delivery notes before it undoes a finishing stage or cancels. */
  onModuleInit(): void {
    this.guards.register(DELIVERY_NOTE_GUARD_NAME, deliveryNoteGuards);
  }
}
