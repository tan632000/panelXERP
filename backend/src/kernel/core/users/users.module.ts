import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '@kernel/core/auth/auth.module';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { FilesModule } from '@kernel/core/files/files.module';
import { UserListPreference } from '@kernel/core/users/entities/list-preference.entity';
import { Role } from '@kernel/core/users/entities/role.entity';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';
import { ListPreferenceController } from '@kernel/core/users/list-preference.controller';
import { ListPreferenceService } from '@kernel/core/users/list-preference.service';
import { UserDisplayNameService } from '@kernel/core/users/user-display-name.service';
import { UserExportSource } from '@kernel/core/users/user-export.source';
import { UserImportService } from '@kernel/core/users/user-import.service';
import { UsersController } from '@kernel/core/users/users.controller';
import { UsersService } from '@kernel/core/users/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      UserRole,
      UserListPreference,
      UserSession,
    ]),
    AuthModule,
    FilesModule,
  ],
  controllers: [UsersController, ListPreferenceController],
  providers: [
    UsersService,
    UserImportService,
    UserExportSource,
    UserDisplayNameService,
    ListPreferenceService,
  ],
  exports: [UsersService, UserDisplayNameService, ListPreferenceService],
})
export class UsersModule {}
