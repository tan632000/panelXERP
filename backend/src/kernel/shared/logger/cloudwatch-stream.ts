import * as os from 'os';

import {
  CloudWatchLogs,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

export class CloudWatchStream {
  private client: CloudWatchLogs;
  private logGroupName: string;
  private logStreamName: string;
  private sequenceToken?: string;
  private initialized = false;

  constructor(
    logGroupName: string,
    private readonly enabled: boolean,
    logStreamName?: string,
  ) {
    this.client = new CloudWatchLogs({
      region: process.env.AWS_REGION || 'ap-southeast-1',
      endpoint: process.env.AWS_ENDPOINT,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          }
        : undefined,
    });
    this.logGroupName = logGroupName;
    this.logStreamName =
      logStreamName ||
      `${process.env.NODE_ENV || 'development'}-${os.hostname()}`;
  }

  async publish(message: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.ensureInitialized();
      const response = await this.client.send(
        new PutLogEventsCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
          sequenceToken: this.sequenceToken,
          logEvents: [
            {
              message,
              timestamp: Date.now(),
            },
          ],
        }),
      );
      this.sequenceToken = response.nextSequenceToken;
    } catch {
      // CloudWatch is best-effort.
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.client.send(
        new CreateLogGroupCommand({ logGroupName: this.logGroupName }),
      );
    } catch {
      // Group may already exist.
    }

    try {
      await this.client.send(
        new CreateLogStreamCommand({
          logGroupName: this.logGroupName,
          logStreamName: this.logStreamName,
        }),
      );
    } catch {
      // Stream may already exist.
    }

    const streams = await this.client.send(
      new DescribeLogStreamsCommand({
        logGroupName: this.logGroupName,
        logStreamNamePrefix: this.logStreamName,
        limit: 1,
      }),
    );

    this.sequenceToken = streams.logStreams?.[0]?.uploadSequenceToken;
    this.initialized = true;
  }
}
