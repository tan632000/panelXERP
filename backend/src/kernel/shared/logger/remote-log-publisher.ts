import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { CloudWatchStream } from '@shared/logger/cloudwatch-stream';

import type { OnModuleDestroy } from '@nestjs/common';

interface RemoteLogPublisherOptions {
  s3Prefix: string;
  cloudWatchGroup: string;
  s3Bucket: string;
  flushIntervalMs: number;
  cloudWatchEnabled: boolean;
  aws: {
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
  };
}

export class RemoteLogPublisher implements OnModuleDestroy {
  private readonly cloudWatch: CloudWatchStream;
  private readonly s3: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Prefix: string;
  private readonly enabled: boolean;
  private readonly buffer: string[] = [];
  private readonly flushTimer: NodeJS.Timeout;

  constructor(options: RemoteLogPublisherOptions) {
    this.enabled = options.cloudWatchEnabled;
    this.s3Prefix = options.s3Prefix;
    this.s3Bucket = options.s3Bucket;
    this.cloudWatch = new CloudWatchStream(
      options.cloudWatchGroup,
      options.cloudWatchEnabled,
    );
    this.s3 = new S3Client({
      region: options.aws.region || 'ap-southeast-1',
      endpoint: options.aws.endpoint,
      forcePathStyle: options.aws.forcePathStyle,
      credentials: options.aws.accessKeyId
        ? {
            accessKeyId: options.aws.accessKeyId,
            secretAccessKey: options.aws.secretAccessKey || '',
          }
        : undefined,
    });

    this.flushTimer = setInterval(() => {
      void this.flushToS3();
    }, options.flushIntervalMs);
  }

  publish(line: string): void {
    if (!this.enabled) {
      return;
    }

    void this.cloudWatch.publish(line);
    this.buffer.push(line);
  }

  private async flushToS3(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) {
      return;
    }

    const batch = this.buffer.splice(0, this.buffer.length);
    const now = new Date();
    const key = `${this.s3Prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}/${now.getUTCHours()}.log`;
    const body = `${batch.join('\n')}\n`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
          Body: body,
          ContentType: 'application/jsonl',
        }),
      );
    } catch {
      this.buffer.unshift(...batch);
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.flushTimer);
    void this.flushToS3();
  }
}
