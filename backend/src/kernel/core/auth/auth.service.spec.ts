import { createHash } from 'crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { AuthService } from '@kernel/core/auth/auth.service';
import { PasswordResetToken } from '@kernel/core/auth/entities/password-reset-token.entity';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { SignatureReviewService } from '@kernel/core/auth/signature-review.service';
import { MAX_SESSIONS_PER_USER } from '@kernel/core/auth/utils/user-sessions.util';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import { EmailService } from '@shared/services/email.service';
import { S3StorageService } from '@shared/services/s3-storage.service';

const PASSWORD = 'Test@123';

/** A role with a long permission list — the shape that used to overflow the token. */
const WAREHOUSE_PERMISSIONS = [
  'other_material_receipt:read',
  'other_material_receipt:write',
  'other_material_issue:read',
];

const USER = {
  id: 12,
  username: 'warehouse',
  fullName: 'Warehouse Keeper',
  email: 'warehouse@example.com',
  isActive: true,
  refreshToken: null,
  lastLoginAt: null,
} as const;

const CONFIG_VALUES: Record<string, unknown> = {
  'app.jwtRefreshSecret': 'refresh-secret',
  'app.webAppUrl': 'https://erp.example.com',
  'app.passwordResetTtlMinutes': 60,
};

interface BuildOptions {
  /** The row `resetTokenRepo.findOne` answers with; `null` means "no such token". */
  resetToken?: Partial<PasswordResetToken> | null;
  user?: Partial<User> | null;
  /** The session `sessionRepo.findOne` answers a refresh with; `null` means none. */
  session?: Partial<UserSession> | null;
  /** The live sessions `sessionRepo.find` lists after a sign-in, newest first. */
  liveSessions?: Array<Pick<UserSession, 'id'>>;
}

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function buildService(
  roleCode: string,
  permissions: string[],
  options: BuildOptions = {},
) {
  const signAsync = jest.fn().mockResolvedValue('signed-token');
  const verifyAsync = jest.fn();
  const user =
    options.user === null
      ? null
      : ({
          ...USER,
          passwordHash: bcrypt.hashSync(PASSWORD, 4),
          ...options.user,
        } as unknown as User);

  const userRepo = {
    findOne: jest.fn().mockResolvedValue(user),
    save: jest.fn().mockImplementation((entity: User) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const resetTokenRepo = {
    findOne: jest.fn().mockResolvedValue(options.resetToken ?? null),
    create: jest
      .fn()
      .mockImplementation((entity: Partial<PasswordResetToken>) => entity),
    save: jest.fn().mockImplementation((entity: PasswordResetToken) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const sessionRepo = {
    create: jest
      .fn()
      .mockImplementation((entity: Partial<UserSession>) => entity),
    save: jest.fn().mockImplementation((entity: Record<string, unknown>) => ({
      id: 41,
      ...entity,
    })),
    find: jest.fn().mockResolvedValue(options.liveSessions ?? [{ id: 41 }]),
    findOne: jest.fn().mockResolvedValue(options.session ?? null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    exists: jest.fn().mockResolvedValue(true),
  };
  const sendQuietly = jest.fn().mockResolvedValue(true);
  const s3 = {
    uploadFile: jest.fn().mockResolvedValue({ key: 'avatars/new.png' }),
    getSignedUrl: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://files.example.com/${key}?signed`),
      ),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const signatureReview = {
    submit: jest.fn().mockResolvedValue(undefined),
    withdraw: jest.fn().mockResolvedValue(undefined),
  };

  const module = await Test.createTestingModule({
    providers: [
      AuthPrincipalCache,
      AuthService,
      { provide: getRepositoryToken(User), useValue: userRepo },
      {
        provide: getRepositoryToken(UserRole),
        useValue: {
          find: jest
            .fn()
            .mockResolvedValue([{ role: { code: roleCode, permissions } }]),
        },
      },
      {
        provide: getRepositoryToken(PasswordResetToken),
        useValue: resetTokenRepo,
      },
      { provide: getRepositoryToken(UserSession), useValue: sessionRepo },
      { provide: JwtService, useValue: { signAsync, verifyAsync } },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => CONFIG_VALUES[key]),
        },
      },
      { provide: EmailService, useValue: { sendQuietly } },
      { provide: S3StorageService, useValue: s3 },
      { provide: SignatureReviewService, useValue: signatureReview },
    ],
  }).compile();

  return {
    service: module.get(AuthService),
    signAsync,
    verifyAsync,
    userRepo,
    resetTokenRepo,
    sessionRepo,
    sendQuietly,
    s3,
    signatureReview,
  };
}

describe('AuthService', () => {
  it('signs an access token carrying identity only', async () => {
    // Permissions in the token are dead weight the JWT strategy never reads, and they push
    // the `access_token` cookie past the ~4KB limit every browser silently drops a cookie at,
    // which locks a signed-in user out of every route the frontend middleware guards.
    const { service, signAsync } = await buildService(
      'warehouse_keeper',
      WAREHOUSE_PERMISSIONS,
    );

    const result = await service.login({
      username: USER.username,
      password: PASSWORD,
    });

    const [accessPayload] = signAsync.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(accessPayload).toEqual({
      sub: USER.id,
      username: USER.username,
      email: USER.email,
      role: 'warehouse_keeper',
      sid: 41,
    });

    // The client still receives them — from the response body, not from the token.
    expect(result.permissions).toEqual(WAREHOUSE_PERMISSIONS);
    expect(result.user.role).toBe('warehouse_keeper');
  });

  // Full access used to be granted by the role code `director`; it now comes from the role's
  // own permission set alone, so the matrix decides what every role reaches.
  it('grants a director only the permissions its role holds', async () => {
    const { service } = await buildService('director', ['quotation:approve']);

    const result = await service.login({
      username: USER.username,
      password: PASSWORD,
    });

    expect(result.permissions).toEqual(['quotation:approve']);
  });

  it('grants full access only through a role that holds the wildcard', async () => {
    const { service } = await buildService('admin', ['*:*']);

    const result = await service.login({
      username: USER.username,
      password: PASSWORD,
    });

    expect(result.permissions).toEqual(['*:*']);
  });

  it('rejects a wrong password', async () => {
    const { service } = await buildService('warehouse_keeper', []);

    await expect(
      service.login({ username: USER.username, password: 'wrong-password' }),
    ).rejects.toThrow('Invalid credentials');
  });

  describe('forgotPassword', () => {
    it('issues a single-use link and revokes the outstanding ones', async () => {
      const { service, resetTokenRepo, sendQuietly } = await buildService(
        'warehouse_keeper',
        [],
      );

      const result = await service.forgotPassword({ email: USER.email });

      expect(result).toEqual({ success: true });
      // The previous links stop working the moment a new one is issued.
      expect(resetTokenRepo.update).toHaveBeenCalledWith(
        { userId: USER.id, isDeleted: false },
        expect.objectContaining({ isDeleted: true }),
      );

      const [saved] = resetTokenRepo.save.mock.calls[0] as [
        { userId: number; tokenHash: string; expiresAt: Date },
      ];
      expect(saved.userId).toBe(USER.id);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());

      const [mail] = sendQuietly.mock.calls[0] as [
        { to: string; text: string },
      ];
      expect(mail.to).toBe(USER.email);
      // The mail carries the plain token; only its hash is ever stored.
      const emailed = /token=([a-f0-9]{64})/.exec(mail.text)?.[1] ?? '';
      expect(emailed).toHaveLength(64);
      expect(createHash('sha256').update(emailed).digest('hex')).toBe(
        saved.tokenHash,
      );
      expect(mail.text).toContain('https://erp.example.com/reset-password');
    });

    it('answers the same for an address with no account, and mails nobody', async () => {
      // A different answer here would let anyone test which addresses work at this company.
      const { service, sendQuietly, resetTokenRepo } = await buildService(
        'warehouse_keeper',
        [],
        { user: null },
      );

      await expect(
        service.forgotPassword({ email: 'stranger@example.com' }),
      ).resolves.toEqual({ success: true });
      expect(sendQuietly).not.toHaveBeenCalled();
      expect(resetTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const TOKEN = 'a'.repeat(64);
    const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

    it('writes the new password, spends the link and drops every session', async () => {
      const record = {
        id: 5,
        userId: USER.id,
        tokenHash: TOKEN_HASH,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      };
      const { service, userRepo, resetTokenRepo, sessionRepo } =
        await buildService('warehouse_keeper', [], {
          resetToken: record,
          user: { refreshToken: 'stored-hash' },
        });

      await expect(
        service.resetPassword({ token: TOKEN, newPassword: 'NewPass123!' }),
      ).resolves.toEqual({ success: true });

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(bcrypt.compareSync('NewPass123!', savedUser.passwordHash)).toBe(
        true,
      );
      // Whoever forced the reset must not keep a refresh token minted before it.
      expect(savedUser.refreshToken).toBeNull();
      expect(sessionRepo.update).toHaveBeenCalledWith(
        { userId: USER.id, isDeleted: false },
        expect.objectContaining({ isDeleted: true }),
      );
      const [spentToken] = resetTokenRepo.save.mock.calls[0] as [
        { usedAt: Date },
      ];
      expect(spentToken.usedAt).toBeInstanceOf(Date);
    });

    it('refuses an expired link', async () => {
      const { service } = await buildService('warehouse_keeper', [], {
        resetToken: {
          userId: USER.id,
          tokenHash: TOKEN_HASH,
          expiresAt: new Date(Date.now() - 1_000),
          usedAt: null,
        },
      });

      await expect(
        service.resetPassword({ token: TOKEN, newPassword: 'NewPass123!' }),
      ).rejects.toThrow('Reset link is invalid or has expired');
    });

    it('refuses a link that was already spent', async () => {
      const { service } = await buildService('warehouse_keeper', [], {
        resetToken: {
          userId: USER.id,
          tokenHash: TOKEN_HASH,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: new Date(),
        },
      });

      await expect(
        service.resetPassword({ token: TOKEN, newPassword: 'NewPass123!' }),
      ).rejects.toThrow('Reset link is invalid or has expired');
    });

    it('refuses an unknown token', async () => {
      const { service } = await buildService('warehouse_keeper', [], {
        resetToken: null,
      });

      await expect(
        service.resetPassword({ token: TOKEN, newPassword: 'NewPass123!' }),
      ).rejects.toThrow('Reset link is invalid or has expired');
    });
  });

  describe('changePassword', () => {
    it('requires the current password', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', []);

      await expect(
        service.changePassword(USER.id, {
          currentPassword: 'wrong-password',
          newPassword: 'NewPass123!',
        }),
      ).rejects.toThrow('Current password is incorrect');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses reusing the password already in place', async () => {
      const { service } = await buildService('warehouse_keeper', []);

      await expect(
        service.changePassword(USER.id, {
          currentPassword: PASSWORD,
          newPassword: PASSWORD,
        }),
      ).rejects.toThrow('The new password must differ from the current one');
    });

    it('writes the new password and signs out every other device', async () => {
      const { service, userRepo, sessionRepo } = await buildService(
        'warehouse_keeper',
        [],
        { user: { refreshToken: 'stored-hash' } },
      );

      await expect(
        service.changePassword(
          USER.id,
          { currentPassword: PASSWORD, newPassword: 'NewPass123!' },
          41,
        ),
      ).resolves.toEqual({ success: true });

      const [where] = sessionRepo.update.mock.calls[0] as [
        Record<string, unknown>,
      ];
      // Every session of the account but the caller's own.
      expect(where).toMatchObject({ userId: USER.id, isDeleted: false });
      expect(where.id).toEqual(expect.objectContaining({ _type: 'not' }));

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(bcrypt.compareSync('NewPass123!', savedUser.passwordHash)).toBe(
        true,
      );
      expect(savedUser.refreshToken).toBeNull();
    });
  });

  describe('sessions', () => {
    it('opens a session per sign-in without touching the other devices', async () => {
      const { service, sessionRepo, userRepo } = await buildService(
        'warehouse_keeper',
        [],
      );

      const result = await service.login({
        username: USER.username,
        password: PASSWORD,
      });

      expect(result.refreshToken).toBe('signed-token');
      const saved = (sessionRepo.save.mock.calls as UserSession[][]).at(
        -1,
      )?.[0] as UserSession;
      expect(saved.userId).toBe(USER.id);
      // The one write after opening it rotates the new session onto the issued token.
      expect(sessionRepo.update).toHaveBeenCalledTimes(1);
      expect(sessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 41, isDeleted: false }),
        expect.objectContaining({ tokenHash: hash('signed-token') }),
      );
      // Nothing revoked: the account's other devices stay signed in.
      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.refreshToken).toBeNull();
    });

    it('drops the least recently used sessions past the device limit', async () => {
      const liveSessions = Array.from(
        { length: MAX_SESSIONS_PER_USER + 2 },
        (_, index) => ({ id: 100 - index }),
      );
      const { service, sessionRepo } = await buildService(
        'warehouse_keeper',
        [],
        { liveSessions },
      );

      await service.login({ username: USER.username, password: PASSWORD });

      expect(sessionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { lastUsedAt: 'DESC', id: 'DESC' } }),
      );
      const [where] = sessionRepo.update.mock.calls[0] as [
        { id: { value: number[] } },
      ];
      expect(where.id.value).toEqual([90, 89]);
    });

    it('renews one session and rotates its refresh token', async () => {
      const { service, verifyAsync, sessionRepo } = await buildService(
        'warehouse_keeper',
        [],
        { session: { id: 41, userId: USER.id, tokenHash: hash('old-token') } },
      );
      verifyAsync.mockResolvedValue({ sub: USER.id, type: 'refresh', sid: 41 });

      await expect(service.refresh('old-token')).resolves.toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });

      expect(sessionRepo.update).toHaveBeenCalledWith(
        { id: 41, tokenHash: hash('old-token'), isDeleted: false },
        expect.objectContaining({ tokenHash: hash('signed-token') }),
      );
    });

    it('refuses the second of two renewals racing on one refresh token', async () => {
      const { service, verifyAsync, sessionRepo } = await buildService(
        'warehouse_keeper',
        [],
        { session: { id: 41, userId: USER.id, tokenHash: hash('old-token') } },
      );
      verifyAsync.mockResolvedValue({ sub: USER.id, type: 'refresh', sid: 41 });
      // The other request swapped the hash between this one's read and its write.
      sessionRepo.update.mockResolvedValueOnce({ affected: 0 });

      await expect(service.refresh('old-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('refuses a rotated-out token without revoking the session', async () => {
      const { service, verifyAsync, sessionRepo } = await buildService(
        'warehouse_keeper',
        [],
        { session: { id: 41, userId: USER.id, tokenHash: hash('newer') } },
      );
      verifyAsync.mockResolvedValue({ sub: USER.id, type: 'refresh', sid: 41 });

      await expect(service.refresh('older')).rejects.toThrow(
        'Invalid refresh token',
      );
      expect(sessionRepo.update).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('moves a token issued before sessions existed into a session', async () => {
      const { service, verifyAsync, sessionRepo, userRepo } =
        await buildService('warehouse_keeper', [], {
          user: { refreshToken: hash('legacy-token') },
        });
      verifyAsync.mockResolvedValue({ sub: USER.id, type: 'refresh' });

      await expect(service.refresh('legacy-token')).resolves.toMatchObject({
        refreshToken: 'signed-token',
      });

      expect(sessionRepo.save).toHaveBeenCalled();
      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.refreshToken).toBeNull();
    });

    it('signs out only the calling device', async () => {
      const { service, sessionRepo, userRepo } = await buildService(
        'warehouse_keeper',
        [],
      );

      await service.logout(USER.id, 41);

      expect(sessionRepo.update).toHaveBeenCalledWith(
        { id: 41, userId: USER.id, isDeleted: false },
        expect.objectContaining({ isDeleted: true }),
      );
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('writes the directory fields and clears the ones emptied', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', [], {
        user: { phone: '0900000000', department: 'sales', title: 'Thu kho' },
      });

      const result = await service.updateProfile(USER.id, {
        fullName: 'Nguyen Van Kho',
        phone: null,
        department: 'warehouse',
        title: null,
      });

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.fullName).toBe('Nguyen Van Kho');
      expect(savedUser.phone).toBeNull();
      expect(savedUser.department).toBe('warehouse');
      expect(savedUser.title).toBeNull();
      expect(result.user.fullName).toBe('Nguyen Van Kho');
    });

    it('lets any account change its own email with the current password', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', [
        'other_material_receipt:read',
      ]);
      // Nothing else holds the new username or address.
      userRepo.findOne
        .mockResolvedValueOnce({
          ...USER,
          passwordHash: bcrypt.hashSync(PASSWORD, 4),
        })
        .mockResolvedValue(null);

      await service.updateProfile(USER.id, {
        fullName: 'Warehouse Keeper',
        username: 'kho-moi',
        email: 'kho-moi@example.com',
        currentPassword: PASSWORD,
      });

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.username).toBe('kho-moi');
      expect(savedUser.email).toBe('kho-moi@example.com');
    });

    it('lets any account rename its own username', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', [
        'other_material_receipt:read',
      ]);
      userRepo.findOne
        .mockResolvedValueOnce({ ...USER, passwordHash: 'hash' })
        .mockResolvedValue(null);

      await service.updateProfile(USER.id, {
        fullName: 'Warehouse Keeper',
        username: 'kho-vat-tu',
        // The form sends the unchanged address back; that is not an email change.
        email: USER.email,
      });

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.username).toBe('kho-vat-tu');
      expect(savedUser.email).toBe(USER.email);
    });

    it.each([
      ['without the current password', undefined],
      ['with a wrong current password', 'wrong-password'],
    ])(
      'refuses an email change %s, even from a full-access account',
      async (_case, currentPassword) => {
        const { service, userRepo } = await buildService('admin', ['*:*']);

        await expect(
          service.updateProfile(USER.id, {
            fullName: 'Warehouse Keeper',
            email: 'someone-else@example.com',
            currentPassword,
          }),
        ).rejects.toThrow('Current password is incorrect');
        expect(userRepo.save).not.toHaveBeenCalled();
      },
    );

    it('refuses an identity another account already holds', async () => {
      const { service, userRepo } = await buildService('admin', ['*:*']);
      userRepo.findOne
        .mockResolvedValueOnce({
          ...USER,
          passwordHash: 'hash',
        })
        .mockResolvedValue({ id: 99 });

      await expect(
        service.updateProfile(USER.id, {
          fullName: 'Warehouse Keeper',
          username: 'taken',
        }),
      ).rejects.toThrow('Username is already in use');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('leaves a field the payload omits untouched', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', [], {
        user: { phone: '0900000000' },
      });

      await service.updateProfile(USER.id, { fullName: 'Nguyen Van Kho' });

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.phone).toBe('0900000000');
    });
  });

  describe('avatar', () => {
    const file = {
      originalname: 'me.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    it('stores the object key and signs a URL for the session', async () => {
      const { service, userRepo, s3 } = await buildService(
        'warehouse_keeper',
        [],
      );

      const result = await service.updateAvatar(USER.id, file);

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.avatarUrl).toBe('avatars/new.png');
      expect(result.user.avatarUrl).toBe(
        'https://files.example.com/avatars/new.png?signed',
      );
      expect(s3.uploadFile).toHaveBeenCalledWith(file, 'avatars');
    });

    it('drops the picture it replaces', async () => {
      const { service, s3 } = await buildService('warehouse_keeper', [], {
        user: { avatarUrl: 'avatars/old.png' },
      });

      await service.updateAvatar(USER.id, file);

      expect(s3.deleteObject).toHaveBeenCalledWith('avatars/old.png');
    });

    it('drops the new upload when the account cannot be saved', async () => {
      const { service, userRepo, s3 } = await buildService(
        'warehouse_keeper',
        [],
        { user: { avatarUrl: 'avatars/old.png' } },
      );
      userRepo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(service.updateAvatar(USER.id, file)).rejects.toThrow(
        'db down',
      );
      expect(s3.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3.deleteObject).toHaveBeenCalledWith('avatars/new.png');
    });

    it('refuses a file that is not an accepted image', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', []);

      await expect(
        service.updateAvatar(USER.id, {
          ...file,
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow('Avatar must be a JPEG, PNG or WebP image');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('clears the stored avatar on removal', async () => {
      const { service, userRepo, s3 } = await buildService(
        'warehouse_keeper',
        [],
        { user: { avatarUrl: 'avatars/old.png' } },
      );

      const result = await service.removeAvatar(USER.id);

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.avatarUrl).toBeNull();
      expect(result.user.avatarUrl).toBeNull();
      expect(s3.deleteObject).toHaveBeenCalledWith('avatars/old.png');
    });
  });

  describe('signature', () => {
    const file = {
      originalname: 'signature.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
    } as Express.Multer.File;

    it('sends a non-administrator signature for review instead of applying it', async () => {
      const { service, userRepo, s3, signatureReview } = await buildService(
        'warehouse_keeper',
        ['other_material_receipt:read'],
        { user: { signatureUrl: 'signatures/old.png' } },
      );

      const result = await service.updateSignature(USER.id, file);

      expect(signatureReview.submit).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER.id }),
        file,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(result.user.signatureUrl).toBe(
        'https://files.example.com/signatures/old.png?signed',
      );
    });

    it('stores the director signature directly, without a review request', async () => {
      const { service, userRepo, s3, signatureReview } = await buildService(
        'director',
        ['*:*'],
      );
      s3.uploadFile.mockResolvedValue({ key: 'signatures/director.png' });

      const result = await service.updateSignature(USER.id, file);

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.signatureUrl).toBe('signatures/director.png');
      expect(result.user.signatureUrl).toBe(
        'https://files.example.com/signatures/director.png?signed',
      );
      expect(signatureReview.submit).not.toHaveBeenCalled();
    });

    it('stores the object key under its own prefix and signs a URL for the session', async () => {
      const { service, userRepo, s3 } = await buildService('admin', ['*:*']);
      s3.uploadFile.mockResolvedValue({ key: 'signatures/new.png' });

      const result = await service.updateSignature(USER.id, file);

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.signatureUrl).toBe('signatures/new.png');
      expect(result.user.signatureUrl).toBe(
        'https://files.example.com/signatures/new.png?signed',
      );
      expect(s3.uploadFile).toHaveBeenCalledWith(file, 'signatures');
    });

    it('drops the signature it replaces and leaves the avatar alone', async () => {
      const { service, s3 } = await buildService('admin', ['*:*'], {
        user: {
          avatarUrl: 'avatars/me.png',
          signatureUrl: 'signatures/old.png',
        },
      });

      await service.updateSignature(USER.id, file);

      expect(s3.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/old.png');
    });

    it('drops the new upload when the account cannot be saved, leaving the old one', async () => {
      const { service, userRepo, s3 } = await buildService('admin', ['*:*'], {
        user: { signatureUrl: 'signatures/old.png' },
      });
      s3.uploadFile.mockResolvedValue({ key: 'signatures/new.png' });
      userRepo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(service.updateSignature(USER.id, file)).rejects.toThrow(
        'db down',
      );
      expect(s3.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/new.png');
    });

    it('still succeeds when the replaced signature cannot be deleted', async () => {
      const { service, s3 } = await buildService('admin', ['*:*'], {
        user: { signatureUrl: 'signatures/old.png' },
      });
      s3.uploadFile.mockResolvedValue({ key: 'signatures/new.png' });
      s3.deleteObject.mockRejectedValueOnce(new Error('s3 down'));

      const result = await service.updateSignature(USER.id, file);

      expect(result.user.signatureUrl).toBe(
        'https://files.example.com/signatures/new.png?signed',
      );
    });

    it('refuses anything but a PNG, which is the only format that keeps transparency', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', []);

      await expect(
        service.updateSignature(USER.id, { ...file, mimetype: 'image/jpeg' }),
      ).rejects.toThrow('Signature must be a PNG image');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a signature larger than 15MB', async () => {
      const { service, userRepo } = await buildService('warehouse_keeper', []);

      await expect(
        service.updateSignature(USER.id, {
          ...file,
          size: 15 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow('Signature must be 15MB or smaller');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it("withdraws the caller's own signature waiting for review", async () => {
      const { service, signatureReview } = await buildService(
        'warehouse_keeper',
        [],
        { user: { pendingSignatureUrl: 'signatures/pending.png' } },
      );

      await service.withdrawSignatureRequest(USER.id);

      expect(signatureReview.withdraw).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER.id }),
      );
    });

    it('clears the stored signature on removal', async () => {
      const { service, userRepo, s3 } = await buildService(
        'warehouse_keeper',
        [],
        { user: { signatureUrl: 'signatures/old.png' } },
      );

      const result = await service.removeSignature(USER.id);

      const [savedUser] = userRepo.save.mock.calls[0] as [User];
      expect(savedUser.signatureUrl).toBeNull();
      expect(result.user.signatureUrl).toBeNull();
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/old.png');
    });
  });
});
