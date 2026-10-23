import { randomUUID } from 'crypto';
import { Readable } from 'stream';

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  /** Separate client for presigned URLs when internal endpoint differs from browser-reachable host. */
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('aws.region') ?? 'ap-southeast-1';
    const endpoint = this.config.get<string>('aws.endpoint');
    const s3PublicEndpoint =
      this.config.get<string>('aws.s3PublicEndpoint') || endpoint;
    const accessKeyId = this.config.get<string>('aws.accessKeyId');
    const secretAccessKey = this.config.get<string>('aws.secretAccessKey');
    const clientOptions = {
      region,
      forcePathStyle: this.config.get<boolean>('aws.forcePathStyle') ?? false,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    };

    this.client = new S3Client({
      ...clientOptions,
      endpoint: endpoint || undefined,
    });
    this.signingClient =
      s3PublicEndpoint && s3PublicEndpoint !== endpoint
        ? new S3Client({
            ...clientOptions,
            endpoint: s3PublicEndpoint,
          })
        : this.client;
    this.bucket = this.config.get<string>('aws.s3Bucket') ?? 'erp-files';
  }

  async upload(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, bucket: this.bucket };
  }

  async uploadFile(file: Express.Multer.File, folder = 'uploads') {
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '';
    const key = `${folder}/${randomUUID()}${ext}`;
    await this.upload(key, file.buffer, file.mimetype);
    return { key, bucket: this.bucket, originalName: file.originalname };
  }

  async getSignedUrl(
    key: string,
    expiresIn = 3600,
    options?: { responseContentDisposition?: string },
  ) {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options?.responseContentDisposition
          ? {
              ResponseContentDisposition: options.responseContentDisposition,
            }
          : {}),
      }),
      { expiresIn },
    );
  }

  /** The stored object as a stream, for relaying a download without buffering it. */
  async getObjectStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as Readable;
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
