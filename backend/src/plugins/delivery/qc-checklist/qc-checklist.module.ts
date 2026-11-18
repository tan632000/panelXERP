import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { QcChecklistItem } from '@plugins/delivery/qc-checklist/entities/qc-checklist-item.entity';
import { QcChecklistController } from '@plugins/delivery/qc-checklist/qc-checklist.controller';
import { QcChecklistService } from '@plugins/delivery/qc-checklist/services/qc-checklist.service';

@Module({
  imports: [TypeOrmModule.forFeature([QcChecklistItem])],
  controllers: [QcChecklistController],
  providers: [QcChecklistService],
  exports: [QcChecklistService],
})
export class QcChecklistModule {}
