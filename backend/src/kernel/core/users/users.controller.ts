import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { instanceToPlain } from 'class-transformer';

import { AuthService } from '@kernel/core/auth/auth.service';
import {
  CurrentUser,
  RequirePermission,
} from '@kernel/core/auth/decorators/auth.decorators';
import { SignatureReviewService } from '@kernel/core/auth/signature-review.service';
import { ExcelJobService } from '@kernel/core/files/excel-job.service';
import { USER_EXPORT_SOURCE } from '@kernel/core/users/constants/user-export.constant';
import {
  USER_EXPORT,
  USER_IMPORT,
} from '@kernel/core/users/constants/user-permission.constant';
import { AdminResetPasswordDto } from '@kernel/core/users/dto/admin-reset-password.dto';
import { CreateUserDto } from '@kernel/core/users/dto/create-user.dto';
import { RejectSignatureDto } from '@kernel/core/users/dto/reject-signature.dto';
import { SetUserActiveDto } from '@kernel/core/users/dto/set-user-active.dto';
import { UpdateUserDto } from '@kernel/core/users/dto/update-user.dto';
import { UserExportDto } from '@kernel/core/users/dto/user-export.dto';
import {
  UserColumnValuesQueryDto,
  UserFilterDto,
} from '@kernel/core/users/dto/user-filter.dto';
import { UserImportService } from '@kernel/core/users/user-import.service';
import {
  USER_COLUMN_FILTERS,
  UsersService,
} from '@kernel/core/users/users.service';

import { ActivityLogService } from '@shared/activities/activity-log.service';
import { BulkApproveEndpoint } from '@shared/decorators/bulk-approve-endpoint.decorator';
import { BulkDeleteEndpoint } from '@shared/decorators/bulk-delete-endpoint.decorator';
import { ColumnValuesEndpoint } from '@shared/decorators/column-values-endpoint.decorator';
import { BulkApproveDto } from '@shared/dto/bulk-approve.dto';
import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';
import { ExcelImportRequestDto } from '@shared/dto/excel-import-request.dto';
import { bulkApprove } from '@shared/utils/bulk-approve.util';
import { columnFilterKeys } from '@shared/utils/column-filter.util';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userImportService: UserImportService,
    private readonly excelJobs: ExcelJobService,
    private readonly authService: AuthService,
    private readonly signatureReview: SignatureReviewService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @ApiOperation({
    summary: 'List users',
    description:
      'Paginated account list with keyword search, role filter and active filter.',
  })
  @Get()
  @RequirePermission('*:*')
  findAll(@Query() query: UserFilterDto) {
    return this.usersService.findAll(query);
  }

  @ColumnValuesEndpoint({
    permission: '*:*',
    columns: columnFilterKeys(USER_COLUMN_FILTERS),
    subject: 'user',
  })
  findColumnValues(@Query() query: UserColumnValuesQueryDto) {
    return this.usersService.findColumnValues(query);
  }

  @ApiOperation({ summary: 'List the roles an account can be assigned to' })
  @Get('roles')
  @RequirePermission('*:*')
  findAssignableRoles() {
    return this.usersService.findAssignableRoles();
  }

  @ApiOperation({ summary: 'Read one account' })
  @Get(':id')
  @RequirePermission('*:*')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @ApiOperation({
    summary: 'Create an account',
    description:
      'Without a password the account is mailed a single-use link to set its own.',
  })
  @Post()
  @RequirePermission('*:*')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const user = await this.usersService.create(dto, actor.userId);

    if (!dto.password) {
      await this.authService.forgotPassword({ email: dto.email }, true);
    }

    this.activityLog.track({
      module: 'users',
      action: 'create',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: user.id,
      message: 'Administrator created a user account',
    });

    return user;
  }

  @ApiOperation({ summary: 'Update an account' })
  @Patch(':id')
  @RequirePermission('*:*')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const user = await this.usersService.update(id, dto, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: 'update',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: 'Administrator updated a user account',
    });

    return user;
  }

  @ApiOperation({
    summary: 'Deactivate or restore an account',
    description:
      'A deactivated account keeps its records but loses every session it holds.',
  })
  @Patch(':id/active')
  @RequirePermission('*:*')
  async setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserActiveDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const user = await this.usersService.setActive(id, dto, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: dto.isActive ? 'restore' : 'deactivate',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: dto.isActive
        ? 'Administrator restored a user account'
        : 'Administrator deactivated a user account',
    });

    return user;
  }

  @ApiOperation({
    summary: "Approve an account's signature waiting for review",
    description:
      'The waiting signature becomes the one printed documents stamp, replacing the old one.',
  })
  @Post(':id/signature/approve')
  @RequirePermission('*:*')
  async approveSignature(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    await this.approveOneSignature(id, actor);
    return this.usersService.findOne(id);
  }

  @BulkApproveEndpoint({
    permission: '*:*',
    subject: 'user signatures',
    route: 'signatures/bulk-approve',
  })
  bulkApproveSignatures(
    @Body() dto: BulkApproveDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    return bulkApprove(dto.ids, (id) => this.approveOneSignature(id, actor));
  }

  /** The one approval, with its audit entry, shared by the single and the bulk route. */
  private async approveOneSignature(
    id: number,
    actor: { userId: number; username?: string },
  ): Promise<void> {
    await this.signatureReview.approve(id, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: 'approve',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: 'Administrator approved a user signature',
    });
  }

  @ApiOperation({
    summary: "Reject an account's signature waiting for review",
    description:
      'The waiting signature is dropped; the reason is shown to the holder on their profile.',
  })
  @Post(':id/signature/reject')
  @RequirePermission('*:*')
  async rejectSignature(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSignatureDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    await this.signatureReview.reject(id, dto.reason, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: 'reject',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: 'Administrator rejected a user signature',
    });

    return this.usersService.findOne(id);
  }

  @ApiOperation({
    summary: 'Deactivate every ticked account',
    description:
      'Reports per row: a refused account leaves the rest of the batch deactivated.',
  })
  @Post('bulk-deactivate')
  @RequirePermission('*:*')
  async bulkDeactivate(
    @Body() dto: BulkDeleteDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const result = await this.usersService.bulkDeactivate(
      dto.ids,
      actor.userId,
    );

    this.activityLog.track({
      module: 'users',
      action: 'deactivate',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      message: `Administrator deactivated ${result.deleted.length} user account(s)`,
    });

    return result;
  }

  @ApiOperation({
    summary: 'Delete an account',
    description:
      'Soft-deletes the account: it leaves the list, frees its username and email, and loses every session it holds.',
  })
  @Delete(':id')
  @RequirePermission('*:*')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const result = await this.usersService.remove(id, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: 'delete',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: 'Administrator deleted a user account',
    });

    return result;
  }

  @BulkDeleteEndpoint({ permission: '*:*', subject: 'user accounts' })
  async bulkRemove(
    @Body() dto: BulkDeleteDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const result = await this.usersService.removeMany(dto.ids, actor.userId);

    this.activityLog.track({
      module: 'users',
      action: 'delete',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      message: `Administrator deleted ${result.deleted.length} user account(s)`,
    });

    return result;
  }

  @ApiOperation({
    summary: 'Import accounts from a parsed .xlsx',
    description:
      "All or nothing: each row is judged by the create form's own rules and saved through the same create, in one transaction. " +
      'Any error rejects the file with every problem located by sheet row. No password is read from the file.',
  })
  @Post('import')
  @RequirePermission(USER_IMPORT)
  @ApiResponse({ status: 201, description: '{ created, updated }' })
  @ApiResponse({
    status: 400,
    description:
      'Import rejected — errors[{ fileRow, field?, code, message? }]',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async importUsers(
    @Body() dto: ExcelImportRequestDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const result = await this.userImportService.import(
      dto.documents,
      actor.userId,
    );

    this.activityLog.track({
      module: 'users',
      action: 'import',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      message: `Administrator imported ${result.created} user account(s)`,
    });

    return result;
  }

  @ApiOperation({
    summary: 'Queue an Excel export of the account list',
    description:
      'Queues every account matching the posted search/filters/sort as a zipped .xlsx laid out like the list, one row per account. ' +
      'Follow the job on GET /excel/jobs/{id}/events and download it once from GET /excel/jobs/{id}/download.',
  })
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission(USER_EXPORT)
  @ApiResponse({ status: 202, description: 'Queued; returns jobId' })
  @ApiResponse({
    status: 400,
    description:
      'invalidSpec or unknownField — a column the list cannot export',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 429, description: 'tooManyJobs' })
  export(@Body() dto: UserExportDto, @CurrentUser() actor: { userId: number }) {
    return this.excelJobs.enqueueExport({
      userId: actor.userId,
      sourceKey: USER_EXPORT_SOURCE,
      label: dto.fileName,
      fileName: dto.fileName,
      query: instanceToPlain(dto.query),
      sheet: dto.sheet,
      context: {},
    });
  }

  @ApiOperation({ summary: "Set another account's password" })
  @Post(':id/reset-password')
  @RequirePermission('*:*')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() actor: { userId: number; username?: string },
  ) {
    const result = await this.usersService.resetPassword(id, dto);

    this.activityLog.track({
      module: 'users',
      action: 'reset-password',
      userId: actor.userId,
      username: actor.username,
      targetType: 'user',
      targetId: id,
      message: 'Administrator reset a user password',
    });

    return result;
  }
}
