import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '@kernel/core/auth/auth.module';
import { RolesController } from '@kernel/core/roles/roles.controller';
import { RolesService } from '@kernel/core/roles/roles.service';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole]), AuthModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
