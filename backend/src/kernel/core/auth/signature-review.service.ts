import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotificationService } from '@kernel/core/audit/notification.service';
import {
  PROFILE_LINK,
  SIGNATURE_REVIEWER_ROLE_CODES,
  SIGNATURE_REVIEWER_SCOPE,
  SIGNATURE_REVIEW_APPROVED_EVENT,
  SIGNATURE_REVIEW_REJECTED_EVENT,
  SIGNATURE_REVIEW_REQUESTED_EVENT,
  signatureReviewDedupeKey,
  signatureReviewLink,
} from '@kernel/core/auth/constants/signature-review.constant';
import { User } from '@kernel/core/users/entities/user.entity';
import { discardStoredImage } from '@kernel/core/users/utils/stored-image-url.util';

import { S3StorageService } from '@shared/services/s3-storage.service';

/** Same prefix the applied signatures use, so one storage sweep covers both. */
const SIGNATURE_FOLDER = 'signatures';

/**
 * The review a signature goes through when its holder is not an administrator.
 *
 * A signature is stamped onto printed documents, so a new one waits beside the current one
 * until an administrator approves it; until then documents keep printing the old one. Each
 * account has at most one waiting signature and one open request to the administrators.
 */
@Injectable()
export class SignatureReviewService {
  private readonly logger = new Logger(SignatureReviewService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly s3: S3StorageService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Parks an uploaded signature for review and pages the administrators. A signature already
   * waiting is replaced, and so is the request that announced it, so the reviewer only ever
   * sees the latest one.
   */
  async submit(user: User, file: Express.Multer.File): Promise<void> {
    const previousKey = user.pendingSignatureUrl;
    const { key } = await this.s3.uploadFile(file, SIGNATURE_FOLDER);
    user.pendingSignatureUrl = key;
    user.signatureRequestedAt = new Date();
    user.signatureRejectionReason = null;
    try {
      await this.userRepo.save(user);
    } catch (error) {
      user.pendingSignatureUrl = previousKey;
      await discardStoredImage(this.s3, this.logger, key);
      throw error;
    }
    await discardStoredImage(this.s3, this.logger, previousKey);

    await this.closeRequest(user.id, user.id);
    await this.notifications.emit({
      eventType: SIGNATURE_REVIEW_REQUESTED_EVENT,
      roleCodes: [...SIGNATURE_REVIEWER_ROLE_CODES],
      requiredScope: SIGNATURE_REVIEWER_SCOPE,
      excludeUserIds: [user.id],
      dedupeKey: signatureReviewDedupeKey(user.id),
      link: signatureReviewLink(user.id),
      payload: {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
      },
      createdBy: user.id,
    });
  }

  /** Takes back the caller's own waiting signature before anyone has reviewed it. */
  async withdraw(user: User): Promise<void> {
    const pendingKey = this.requirePending(user);
    this.clearPending(user);
    await this.userRepo.save(user);
    await discardStoredImage(this.s3, this.logger, pendingKey);
    await this.closeRequest(user.id, user.id);
  }

  /** Makes the waiting signature the one documents print, dropping the one it replaces. */
  async approve(userId: number, actorId: number): Promise<void> {
    const user = await this.loadAccount(userId);
    const pendingKey = this.requirePending(user);
    const previousKey = user.signatureUrl;

    user.signatureUrl = pendingKey;
    this.clearPending(user);
    user.signatureRejectionReason = null;
    user.updatedBy = actorId;
    await this.userRepo.save(user);
    await discardStoredImage(this.s3, this.logger, previousKey);

    await this.closeRequest(user.id, actorId);
    await this.notifications.emit({
      eventType: SIGNATURE_REVIEW_APPROVED_EVENT,
      roleCodes: [],
      userIds: [user.id],
      link: PROFILE_LINK,
      payload: { userId: user.id },
      createdBy: actorId,
    });
  }

  /**
   * Drops the waiting signature and keeps the reason on the account, so its holder reads why
   * on their profile. The signature documents print is left as it was.
   */
  async reject(userId: number, reason: string, actorId: number): Promise<void> {
    const user = await this.loadAccount(userId);
    const pendingKey = this.requirePending(user);

    this.clearPending(user);
    user.signatureRejectionReason = reason;
    user.updatedBy = actorId;
    await this.userRepo.save(user);
    await discardStoredImage(this.s3, this.logger, pendingKey);

    await this.closeRequest(user.id, actorId);
    await this.notifications.emit({
      eventType: SIGNATURE_REVIEW_REJECTED_EVENT,
      roleCodes: [],
      userIds: [user.id],
      link: PROFILE_LINK,
      payload: { userId: user.id, reason },
      createdBy: actorId,
    });
  }

  private requirePending(user: User): string {
    if (!user.pendingSignatureUrl) {
      throw new BadRequestException('No signature is waiting for review');
    }
    return user.pendingSignatureUrl;
  }

  private clearPending(user: User): void {
    user.pendingSignatureUrl = null;
    user.signatureRequestedAt = null;
  }

  private closeRequest(userId: number, actorId: number) {
    return this.notifications.close({
      eventType: SIGNATURE_REVIEW_REQUESTED_EVENT,
      dedupeKey: signatureReviewDedupeKey(userId),
      updatedBy: actorId,
    });
  }

  private async loadAccount(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
