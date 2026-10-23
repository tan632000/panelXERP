import { createHash, randomBytes } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { ChangePasswordDto } from '@kernel/core/auth/dto/change-password.dto';
import { ForgotPasswordDto } from '@kernel/core/auth/dto/forgot-password.dto';
import { LoginDto } from '@kernel/core/auth/dto/login.dto';
import { ResetPasswordDto } from '@kernel/core/auth/dto/reset-password.dto';
import { UpdateProfileDto } from '@kernel/core/auth/dto/update-profile.dto';
import { PasswordResetToken } from '@kernel/core/auth/entities/password-reset-token.entity';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { SignatureReviewService } from '@kernel/core/auth/signature-review.service';
import {
  MAX_SESSIONS_PER_USER,
  REFRESH_TOKEN_TTL,
  liveSessionsOf,
  revokeUserSessions,
  sessionExpiry,
} from '@kernel/core/auth/utils/user-sessions.util';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';
import {
  discardStoredImage,
  resolveStoredImageUrl,
} from '@kernel/core/users/utils/stored-image-url.util';

import { EmailService } from '@shared/services/email.service';
import { S3StorageService } from '@shared/services/s3-storage.service';

/** Work factor for every password this service writes, matching the seeded users. */
const BCRYPT_ROUNDS = 10;

/** Avatars live under one prefix so a storage sweep can find them without a table lookup. */
const AVATAR_FOLDER = 'avatars';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Signatures get their own prefix, apart from avatars, for the same sweep reason. */
const SIGNATURE_FOLDER = 'signatures';

export const SIGNATURE_MAX_BYTES = 15 * 1024 * 1024;

/**
 * PNG only: the browser removes the paper background before upload, and PNG is the format
 * that keeps the transparency a signature needs to sit over a printed document.
 */
export const SIGNATURE_MIME_TYPES = ['image/png'];

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Reset tokens are stored hashed for the same reason refresh tokens are. */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * The profile shape both sign-in and session lookup hand back to the client. It carries the
 * directory fields the profile screen shows, so that screen needs no second request — and
 * nothing beyond them: this object is mirrored into the browser's session storage.
 */
function sessionUser(user: User, roleCode: string) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: roleCode,
    phone: user.phone ?? null,
    department: user.department ?? null,
    title: user.title ?? null,
    avatarUrl: user.avatarUrl ?? null,
    signatureUrl: user.signatureUrl ?? null,
    pendingSignatureUrl: user.pendingSignatureUrl ?? null,
    signatureRequestedAt: user.signatureRequestedAt ?? null,
    signatureRejectionReason: user.signatureRejectionReason ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly s3: S3StorageService,
    private readonly signatureReview: SignatureReviewService,
    private readonly principalCache: AuthPrincipalCache,
  ) {}

  /**
   * The session profile, with the stored avatar and signature keys swapped for URLs the browser
   * can load. The columns keep the key rather than a URL so the link can be re-signed on every
   * read.
   */
  private async buildSession(user: User, roleCode: string) {
    return {
      ...sessionUser(user, roleCode),
      avatarUrl: await resolveStoredImageUrl(this.s3, user.avatarUrl),
      signatureUrl: await resolveStoredImageUrl(this.s3, user.signatureUrl),
      pendingSignatureUrl: await resolveStoredImageUrl(
        this.s3,
        user.pendingSignatureUrl,
      ),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: [
        { username: dto.username, isActive: true },
        { email: dto.username, isActive: true },
      ],
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    const session = await this.openSession(user.id);
    const { accessToken, refreshToken } = await this.issueTokens(
      user,
      roleCode,
      session,
    );

    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return {
      accessToken,
      refreshToken,
      user: await this.buildSession(user, roleCode),
      permissions,
    };
  }

  /**
   * Whether the device an access token names is still signed in. Signing out, a password
   * change or a revoke ends the session, and the access token must stop working with it
   * rather than living on until it expires.
   */
  async isSessionLive(userId: number, sessionId: number): Promise<boolean> {
    return this.sessionRepo.exists({
      where: { id: sessionId, ...liveSessionsOf(userId) },
    });
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);

    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /**
   * Updates the caller's own directory fields and username (function list 1.5). The email
   * stays with administration: it is also where a password reset link is delivered.
   */
  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.loadOwnAccount(userId);
    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);

    if (dto.username !== undefined || dto.email !== undefined) {
      await this.applyIdentityChange(user, dto);
    }

    user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;
    if (dto.department !== undefined) user.department = dto.department ?? null;
    if (dto.title !== undefined) user.title = dto.title ?? null;
    await this.userRepo.save(user);
    this.principalCache.invalidateUser(user.id);

    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /**
   * Rewrites the caller's sign-in identity. Anyone may change their own username and email; a
   * new email also needs the current password, because it is where a password reset link is
   * delivered — a hijacked session alone must not be enough to take the account over.
   *
   * The access token the caller is holding keeps the old claims until it is refreshed. Nothing
   * reads them — the guard resolves the account from `sub` — but the session profile the
   * response carries is the new one, so the screen shows the change immediately.
   */
  private async applyIdentityChange(
    user: User,
    dto: UpdateProfileDto,
  ): Promise<void> {
    if (
      dto.email !== undefined &&
      dto.email !== user.email &&
      !(
        dto.currentPassword &&
        (await bcrypt.compare(dto.currentPassword, user.passwordHash))
      )
    ) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.username !== undefined && dto.username !== user.username) {
      await this.assertIdentityFree(
        { username: dto.username },
        user.id,
        'Username is already in use',
      );
      user.username = dto.username;
    }

    if (dto.email !== undefined && dto.email !== user.email) {
      await this.assertIdentityFree(
        { email: dto.email },
        user.id,
        'Email is already in use',
      );
      user.email = dto.email;
    }
  }

  /**
   * Both columns are unique in the database; checking first turns the driver's constraint
   * error into a message the form can put on the offending field.
   */
  private async assertIdentityFree(
    where: { username: string } | { email: string },
    userId: number,
    message: string,
  ): Promise<void> {
    const existing = await this.userRepo.findOne({
      where: { ...where, isDeleted: false },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException(message);
    }
  }

  /** Replaces the caller's avatar. The picture it replaces is dropped from storage. */
  async updateAvatar(userId: number, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Avatar file is required');
    if (!AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Avatar must be a JPEG, PNG or WebP image');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Avatar must be 2MB or smaller');
    }

    const user = await this.loadOwnAccount(userId);
    await this.replaceStoredImage(user, 'avatarUrl', file, AVATAR_FOLDER);

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /** Clears the caller's avatar, falling the UI back to their initials. */
  async removeAvatar(userId: number) {
    const user = await this.loadOwnAccount(userId);
    const previousKey = user.avatarUrl;

    user.avatarUrl = null;
    await this.userRepo.save(user);
    await this.discardStoredImage(previousKey);

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /**
   * Replaces the caller's electronic signature. An administrator's applies at once and the image
   * it replaces is dropped from storage; anyone else's waits for an administrator's approval.
   */
  async updateSignature(userId: number, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Signature file is required');
    if (!SIGNATURE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Signature must be a PNG image');
    }
    if (file.size > SIGNATURE_MAX_BYTES) {
      throw new BadRequestException('Signature must be 15MB or smaller');
    }

    const user = await this.loadOwnAccount(userId);
    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    if (permissions.includes('*:*')) {
      await this.replaceStoredImage(
        user,
        'signatureUrl',
        file,
        SIGNATURE_FOLDER,
      );
    } else {
      await this.signatureReview.submit(user, file);
    }

    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /** Takes back the caller's signature that is still waiting for review. */
  async withdrawSignatureRequest(userId: number) {
    const user = await this.loadOwnAccount(userId);
    await this.signatureReview.withdraw(user);

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /** Clears the caller's electronic signature. */
  async removeSignature(userId: number) {
    const user = await this.loadOwnAccount(userId);
    const previousKey = user.signatureUrl;

    user.signatureUrl = null;
    await this.userRepo.save(user);
    await this.discardStoredImage(previousKey);

    const { roleCode, permissions } = await this.resolveRoleAccess(user.id);
    return { user: await this.buildSession(user, roleCode), permissions };
  }

  /**
   * Points the account at a newly uploaded image and drops the one it replaces, so storage
   * keeps exactly one object per image. If the account cannot be saved, the new upload is
   * dropped instead: no account points at it, so it would otherwise sit in storage forever.
   */
  private async replaceStoredImage(
    user: User,
    field: 'avatarUrl' | 'signatureUrl',
    file: Express.Multer.File,
    folder: string,
  ): Promise<void> {
    const previousKey = user[field];
    const { key } = await this.s3.uploadFile(file, folder);
    user[field] = key;
    try {
      await this.userRepo.save(user);
    } catch (error) {
      user[field] = previousKey;
      await this.discardStoredImage(key);
      throw error;
    }
    await this.discardStoredImage(previousKey);
  }

  private async loadOwnAccount(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true, isDeleted: false },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private discardStoredImage(key?: string | null) {
    return discardStoredImage(this.s3, this.logger, key);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    try {
      const refreshSecret = this.configService.get<string>(
        'app.jwtRefreshSecret',
      );
      if (!refreshSecret) throw new Error('Missing JWT refresh secret config');
      const payload = await this.jwtService.verifyAsync<{
        sub: string | number;
        type?: string;
        sid?: number;
      }>(refreshToken, { secret: refreshSecret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const userId = Number(payload.sub);
      const user = await this.userRepo.findOne({
        where: { id: userId, isActive: true },
      });
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const incomingHash = hashRefreshToken(refreshToken);
      let session: UserSession | null;
      if (payload.sid === undefined) {
        // Issued before sessions existed: honoured once against the old per-user slot and
        // moved into a session of its own, so the release does not sign everybody out.
        if (!user.refreshToken || user.refreshToken !== incomingHash) {
          throw new UnauthorizedException('Invalid refresh token');
        }
        session = await this.openSession(user.id);
        user.refreshToken = null;
        await this.userRepo.save(user);
      } else {
        session = await this.sessionRepo.findOne({
          where: { id: payload.sid, ...liveSessionsOf(userId) },
        });
        // A rotated-out token is refused without revoking the session: another tab of the
        // same browser renewing first is the ordinary way to get here.
        if (!session || session.tokenHash !== incomingHash) {
          throw new UnauthorizedException('Invalid refresh token');
        }
      }

      const { roleCode } = await this.resolveRoleAccess(userId);
      // Rotate refresh token so stolen tokens cannot be reused after refresh.
      return await this.issueTokens(user, roleCode, session);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Issues a reset link (function list 1.3).
   *
   * The answer is the same whether or not the address belongs to an account: a different
   * response for an unknown address turns this endpoint into a way to enumerate who works
   * here. Issuing also revokes the user's outstanding links, so the newest mail is the only
   * one that still works.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    /** A new account gets the same single-use link, worded as an invitation to set one. */
    invite = false,
  ): Promise<{ success: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email, isActive: true, isDeleted: false },
    });
    if (!user) return { success: true };

    await this.resetTokenRepo.update(
      { userId: user.id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
    );

    const token = randomBytes(32).toString('hex');
    const ttlMinutes =
      this.configService.get<number>('app.passwordResetTtlMinutes') ?? 60;
    await this.resetTokenRepo.save(
      this.resetTokenRepo.create({
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      }),
    );

    const webAppUrl = (
      this.configService.get<string>('app.webAppUrl') ?? ''
    ).replace(/\/$/, '');
    const link = `${webAppUrl}/reset-password?token=${token}`;

    await this.emailService.sendQuietly({
      to: user.email,
      subject: invite ? 'Your ERP account is ready' : 'Password reset request',
      text: [
        `Hello ${user.fullName},`,
        '',
        invite
          ? `An ERP account has been created for you, with the username "${user.username}". Open the link below to set your password:`
          : 'We received a request to reset your ERP password. Open the link below to choose a new one:',
        link,
        '',
        `The link expires in ${ttlMinutes} minutes and can be used once.`,
        invite
          ? 'If the link expires, use "Forgot password" on the sign-in screen to request a new one.'
          : 'If you did not request this, no action is needed — your current password still works.',
      ].join('\n'),
    });

    return { success: true };
  }

  /**
   * Spends a reset link and writes the new password (function list 1.4). Every session is
   * revoked with it: whoever forced the reset must not keep a refresh token issued before it.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const record = await this.resetTokenRepo.findOne({
      where: { tokenHash: hashResetToken(dto.token), isDeleted: false },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const user = await this.userRepo.findOne({
      where: { id: record.userId, isActive: true, isDeleted: false },
    });
    if (!user) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    user.refreshToken = null;
    await this.userRepo.save(user);
    await revokeUserSessions(this.sessionRepo, user.id);
    this.principalCache.invalidateUser(user.id);

    record.usedAt = new Date();
    await this.resetTokenRepo.save(record);

    return { success: true };
  }

  /**
   * Changes the caller's own password. The old one is required so a walk-up on an unlocked
   * screen cannot lock the owner out of their account.
   */
  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    /** The caller's own session, which stays signed in; absent for a pre-session token. */
    sessionId?: number,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findOne({
      where: { id: userId, isActive: true, isDeleted: false },
    });
    if (!user) throw new UnauthorizedException('User not found');

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'The new password must differ from the current one',
      );
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    // The caller keeps this session; every other device loses its own, so none of them can
    // silently mint a new access token after the change.
    user.refreshToken = null;
    await this.userRepo.save(user);
    await revokeUserSessions(this.sessionRepo, user.id, {
      exceptSessionId: sessionId,
    });
    this.principalCache.invalidateUser(user.id);

    return { success: true };
  }

  /**
   * Signs out this device only; the account's other devices stay signed in. A token issued
   * before sessions existed names none, so it can only end every session of the account.
   */
  async logout(userId: number, sessionId?: number): Promise<{ success: true }> {
    if (sessionId === undefined) {
      await this.userRepo.update({ id: userId }, { refreshToken: null });
      await revokeUserSessions(this.sessionRepo, userId, { actorId: userId });
      this.principalCache.invalidateUser(userId);
      return { success: true };
    }
    await this.sessionRepo.update(
      { id: sessionId, userId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    );
    this.principalCache.invalidateUser(userId);
    return { success: true };
  }

  /**
   * The access token carries identity only. Permissions stay out of it on purpose: the JWT
   * strategy reloads them from the database on every request, so a claim here would never be
   * read — but the browser mirrors this token into the `access_token` cookie the frontend
   * middleware gates routes on, and a cookie past the ~4KB per-cookie limit is dropped
   * silently. A role with a long permission list would sign a token no browser would keep.
   */
  private async signAccessToken(
    user: User,
    roleCode: string,
    sessionId: number,
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      email: user.email,
      role: roleCode,
      // Lets sign-out and a password change tell this device from the account's others.
      sid: sessionId,
    });
  }

  /**
   * Opens a session for one more device. Past the account's device limit, the sessions used
   * least recently are revoked, so signing in always succeeds.
   */
  private async openSession(userId: number): Promise<UserSession> {
    const now = new Date();
    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        userId,
        // Replaced by the real token's hash in `issueTokens`; the token has to name this id.
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt: sessionExpiry(now),
        lastUsedAt: now,
        createdBy: userId,
      }),
    );

    const live = await this.sessionRepo.find({
      where: liveSessionsOf(userId),
      order: { lastUsedAt: 'DESC', id: 'DESC' },
      select: { id: true },
    });
    const overflow = live.slice(MAX_SESSIONS_PER_USER).map((row) => row.id);
    if (overflow.length > 0) {
      await this.sessionRepo.update(
        { id: In(overflow) },
        { isDeleted: true, deletedAt: now, deletedBy: userId },
      );
      this.principalCache.invalidateUser(userId);
    }

    return session;
  }

  /** Signs a token pair for one session and rotates the session onto the new refresh token. */
  private async issueTokens(
    user: User,
    roleCode: string,
    session: UserSession,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.signAccessToken(user, roleCode, session.id);
    const refreshToken = await this.signRefreshToken(user.id, session.id);

    // Compare-and-swap on the hash the caller presented: two renewals racing on one refresh
    // token both pass the read-time check, and only the first to swap may receive a pair.
    const now = new Date();
    const rotated = await this.sessionRepo.update(
      { id: session.id, tokenHash: session.tokenHash, isDeleted: false },
      {
        tokenHash: hashRefreshToken(refreshToken),
        lastUsedAt: now,
        expiresAt: sessionExpiry(now),
        updatedBy: user.id,
      },
    );
    if (rotated.affected !== 1) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return { accessToken, refreshToken };
  }

  private async signRefreshToken(
    userId: number,
    sessionId: number,
  ): Promise<string> {
    const refreshSecret = this.configService.get<string>(
      'app.jwtRefreshSecret',
    );
    if (!refreshSecret) throw new Error('Missing JWT refresh secret config');
    return this.jwtService.signAsync(
      { sub: userId, type: 'refresh', sid: sessionId },
      {
        secret: refreshSecret,
        expiresIn: REFRESH_TOKEN_TTL,
        // Two renewals inside the same second would otherwise sign the very same token, and
        // the rotated-out one would keep working.
        jwtid: randomBytes(16).toString('hex'),
      },
    );
  }

  /** The role code and merged permissions a user's role assignments grant. */
  private async resolveRoleAccess(
    userId: number,
  ): Promise<{ roleCode: string; permissions: string[] }> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return {
      roleCode: userRoles[0]?.role?.code ?? 'sale_staff',
      permissions: this.mergePermissions(userRoles),
    };
  }

  private mergePermissions(userRoles: UserRole[]): string[] {
    for (const ur of userRoles) {
      if (ur.role?.code === 'director') return ['*:*'];
    }
    const permSet = new Set<string>();
    for (const ur of userRoles) {
      for (const p of ur.role?.permissions ?? []) {
        permSet.add(p);
      }
    }
    return [...permSet];
  }
}
