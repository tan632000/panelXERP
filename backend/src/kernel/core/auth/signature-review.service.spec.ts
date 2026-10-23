import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';
import {
  SIGNATURE_REVIEW_APPROVED_EVENT,
  SIGNATURE_REVIEW_REJECTED_EVENT,
  SIGNATURE_REVIEW_REQUESTED_EVENT,
} from '@kernel/core/auth/constants/signature-review.constant';
import { SignatureReviewService } from '@kernel/core/auth/signature-review.service';
import { User } from '@kernel/core/users/entities/user.entity';

import { S3StorageService } from '@shared/services/s3-storage.service';

const ADMIN_ID = 1;

const file = {
  originalname: 'signature.png',
  mimetype: 'image/png',
  size: 1024,
  buffer: Buffer.from('x'),
} as Express.Multer.File;

function account(overrides: Partial<User> = {}): User {
  return {
    id: 12,
    username: 'warehouse',
    fullName: 'Warehouse Keeper',
    signatureUrl: 'signatures/current.png',
    pendingSignatureUrl: null,
    signatureRequestedAt: null,
    signatureRejectionReason: null,
    ...overrides,
  } as User;
}

async function buildService(stored: User | null = null) {
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(stored),
    save: jest.fn().mockImplementation((entity: User) => entity),
  };
  const s3 = {
    uploadFile: jest.fn().mockResolvedValue({ key: 'signatures/new.png' }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    emit: jest.fn().mockResolvedValue(1),
    close: jest.fn().mockResolvedValue(1),
  };

  const module = await Test.createTestingModule({
    providers: [
      SignatureReviewService,
      { provide: getRepositoryToken(User), useValue: userRepo },
      { provide: S3StorageService, useValue: s3 },
      { provide: NotificationService, useValue: notifications },
    ],
  }).compile();

  return {
    service: module.get(SignatureReviewService),
    userRepo,
    s3,
    notifications,
  };
}

describe('SignatureReviewService', () => {
  describe('submit', () => {
    it('parks the upload beside the current signature and pages the administrators', async () => {
      const { service, userRepo, notifications } = await buildService();
      const user = account({ signatureRejectionReason: 'Blurry' });

      await service.submit(user, file);

      const [saved] = userRepo.save.mock.calls[0] as [User];
      expect(saved.signatureUrl).toBe('signatures/current.png');
      expect(saved.pendingSignatureUrl).toBe('signatures/new.png');
      expect(saved.signatureRequestedAt).toBeInstanceOf(Date);
      expect(saved.signatureRejectionReason).toBeNull();
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SIGNATURE_REVIEW_REQUESTED_EVENT,
          roleCodes: ['admin'],
          requiredScope: '*:*',
          dedupeKey: 'user:12',
          link: '/system/users?signatureReview=12',
        }),
      );
    });

    it('replaces a signature already waiting, and the request announcing it', async () => {
      const { service, s3, notifications } = await buildService();

      await service.submit(
        account({ pendingSignatureUrl: 'signatures/older.png' }),
        file,
      );

      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/older.png');
      expect(notifications.close).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SIGNATURE_REVIEW_REQUESTED_EVENT,
          dedupeKey: 'user:12',
        }),
      );
      // Closed before the new one is emitted: only one request may be open per account.
      expect(notifications.close.mock.invocationCallOrder[0]).toBeLessThan(
        notifications.emit.mock.invocationCallOrder[0],
      );
    });

    it('drops the new upload when the account cannot be saved', async () => {
      const { service, userRepo, s3, notifications } = await buildService();
      userRepo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(service.submit(account(), file)).rejects.toThrow('db down');
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/new.png');
      expect(notifications.emit).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('makes the waiting signature the printed one and tells the holder', async () => {
      const { service, userRepo, s3, notifications } = await buildService(
        account({ pendingSignatureUrl: 'signatures/pending.png' }),
      );

      await service.approve(12, ADMIN_ID);

      const [saved] = userRepo.save.mock.calls[0] as [User];
      expect(saved.signatureUrl).toBe('signatures/pending.png');
      expect(saved.pendingSignatureUrl).toBeNull();
      expect(saved.updatedBy).toBe(ADMIN_ID);
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/current.png');
      expect(notifications.close).toHaveBeenCalled();
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SIGNATURE_REVIEW_APPROVED_EVENT,
          userIds: [12],
        }),
      );
    });

    it('refuses an account with nothing waiting', async () => {
      const { service, userRepo } = await buildService(account());

      await expect(service.approve(12, ADMIN_ID)).rejects.toThrow(
        'No signature is waiting for review',
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('refuses an account that does not exist', async () => {
      const { service } = await buildService(null);

      await expect(service.approve(99, ADMIN_ID)).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('reject', () => {
    it('drops the waiting signature, keeps the printed one and records why', async () => {
      const { service, userRepo, s3, notifications } = await buildService(
        account({ pendingSignatureUrl: 'signatures/pending.png' }),
      );

      await service.reject(12, 'Signature is cut off', ADMIN_ID);

      const [saved] = userRepo.save.mock.calls[0] as [User];
      expect(saved.signatureUrl).toBe('signatures/current.png');
      expect(saved.pendingSignatureUrl).toBeNull();
      expect(saved.signatureRejectionReason).toBe('Signature is cut off');
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/pending.png');
      expect(notifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SIGNATURE_REVIEW_REJECTED_EVENT,
          userIds: [12],
          payload: { userId: 12, reason: 'Signature is cut off' },
        }),
      );
    });
  });

  describe('withdraw', () => {
    it('drops the waiting signature and closes its request', async () => {
      const { service, userRepo, s3, notifications } = await buildService();

      await service.withdraw(
        account({ pendingSignatureUrl: 'signatures/pending.png' }),
      );

      const [saved] = userRepo.save.mock.calls[0] as [User];
      expect(saved.pendingSignatureUrl).toBeNull();
      expect(s3.deleteObject).toHaveBeenCalledWith('signatures/pending.png');
      expect(notifications.close).toHaveBeenCalled();
      expect(notifications.emit).not.toHaveBeenCalled();
    });
  });
});
