import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import {
  AVATAR_MAX_BYTES,
  AuthService,
  SIGNATURE_MAX_BYTES,
} from '@kernel/core/auth/auth.service';
import {
  Public,
  CurrentUser,
} from '@kernel/core/auth/decorators/auth.decorators';
import { ChangePasswordDto } from '@kernel/core/auth/dto/change-password.dto';
import { ForgotPasswordDto } from '@kernel/core/auth/dto/forgot-password.dto';
import { LoginDto } from '@kernel/core/auth/dto/login.dto';
import { ResetPasswordDto } from '@kernel/core/auth/dto/reset-password.dto';
import { UpdateProfileDto } from '@kernel/core/auth/dto/update-profile.dto';

import { ActivityLogService } from '@shared/activities/activity-log.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @ApiOperation({
    summary: 'Sign in and issue an access and refresh token pair',
    security: [],
  })
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);

    this.activityLog.track({
      module: 'auth',
      action: 'login',
      userId: result.user.id,
      username: result.user.username,
      targetId: result.user.id,
      message: 'User logged in',
    });

    return result;
  }

  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    security: [],
  })
  @Public()
  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @ApiOperation({
    summary: 'Request a password reset link by email',
    description:
      'Always succeeds, whether or not the address belongs to an account, so the response cannot be used to discover who has one.',
    security: [],
  })
  @Public()
  // Mailing is the expensive half, and the caller needs no account to trigger it.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({
    summary: 'Set a new password using a reset link token',
    security: [],
  })
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiOperation({ summary: "Change the signed-in user's own password" })
  @ApiBearerAuth()
  @Post('change-password')
  async changePassword(
    @CurrentUser()
    user: { userId: number; username?: string; sessionId?: number },
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(
      user.userId,
      dto,
      user.sessionId,
    );

    this.activityLog.track({
      module: 'auth',
      action: 'change-password',
      userId: user.userId,
      username: user.username,
      targetId: user.userId,
      message: 'User changed their own password',
    });

    return result;
  }

  @ApiOperation({
    summary: "Revoke the caller's session",
    description:
      "Signs out this device only; the account's sessions on other devices stay valid.",
  })
  @ApiBearerAuth()
  @Post('logout')
  async logout(@CurrentUser() user: { userId: number; sessionId?: number }) {
    const result = await this.authService.logout(user.userId, user.sessionId);
    this.activityLog.track({
      module: 'auth',
      action: 'logout',
      userId: user.userId,
      targetId: user.userId,
      message: 'User logged out',
    });
    return result;
  }

  @ApiOperation({ summary: "Read the signed-in user's own profile" })
  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: { userId: number }) {
    const profile = await this.authService.getProfile(user.userId);

    this.activityLog.track({
      module: 'auth',
      action: 'view',
      targetId: user.userId,
      message: 'Session profile loaded',
    });

    return profile;
  }

  @ApiOperation({ summary: "Update the signed-in user's own directory fields" })
  @ApiBearerAuth()
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: { userId: number; username?: string },
    @Body() dto: UpdateProfileDto,
  ) {
    const profile = await this.authService.updateProfile(user.userId, dto);

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User updated their own profile',
    });

    return profile;
  }

  @ApiOperation({ summary: "Replace the signed-in user's own avatar" })
  @ApiBearerAuth()
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async updateAvatar(
    @CurrentUser() user: { userId: number; username?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const profile = await this.authService.updateAvatar(user.userId, file);

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User updated their own avatar',
    });

    return profile;
  }

  @ApiOperation({ summary: "Remove the signed-in user's own avatar" })
  @ApiBearerAuth()
  @Delete('me/avatar')
  async removeAvatar(
    @CurrentUser() user: { userId: number; username?: string },
  ) {
    const profile = await this.authService.removeAvatar(user.userId);

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User removed their own avatar',
    });

    return profile;
  }

  @ApiOperation({
    summary: "Replace the signed-in user's own electronic signature",
    description:
      'Applies at once for an administrator; anyone else submits it for administrator review.',
  })
  @ApiBearerAuth()
  @Post('me/signature')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SIGNATURE_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async updateSignature(
    @CurrentUser() user: { userId: number; username?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const profile = await this.authService.updateSignature(user.userId, file);

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User updated their own signature',
    });

    return profile;
  }

  @ApiOperation({
    summary: "Withdraw the signed-in user's signature waiting for review",
  })
  @ApiBearerAuth()
  @Delete('me/signature/request')
  async withdrawSignatureRequest(
    @CurrentUser() user: { userId: number; username?: string },
  ) {
    const profile = await this.authService.withdrawSignatureRequest(
      user.userId,
    );

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User withdrew their signature review request',
    });

    return profile;
  }

  @ApiOperation({
    summary: "Remove the signed-in user's own electronic signature",
  })
  @ApiBearerAuth()
  @Delete('me/signature')
  async removeSignature(
    @CurrentUser() user: { userId: number; username?: string },
  ) {
    const profile = await this.authService.removeSignature(user.userId);

    this.activityLog.track({
      module: 'auth',
      action: 'update',
      userId: user.userId,
      username: user.username,
      targetType: 'user',
      targetId: user.userId,
      message: 'User removed their own signature',
    });

    return profile;
  }
}
