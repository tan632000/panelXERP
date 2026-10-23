import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditInterceptor } from '@kernel/core/audit/audit.interceptor';
import { NotificationRead } from '@kernel/core/audit/notification-read.entity';
import { NotificationController } from '@kernel/core/audit/notification.controller';
import { Notification } from '@kernel/core/audit/notification.entity';
import { NotificationService } from '@kernel/core/audit/notification.service';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';

/** Kernel record-keeping: the request audit trail and in-app notifications. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead, UserRole]),
  ],
  controllers: [NotificationController],
  providers: [
    AuditInterceptor,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class AuditModule {}
