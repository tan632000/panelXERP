import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import { LoggerService } from '@shared/logger/logger.service';

import type { MailDriver } from '@kernel/core/config/mail.config';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Kept text-only: every mail this service sends is transactional. */
  text: string;
}

/**
 * Transactional mail over SES or plain SMTP, whichever `mail.driver` resolves to. SES mirrors
 * `S3StorageService`: the same `aws.*` config block, and an `endpoint` override so LocalStack
 * answers in development. SMTP covers the deployments with no SES account, and Mailtrap locally.
 */
@Injectable()
export class EmailService {
  private readonly from: string;
  /** Bound at construction so the driver is resolved once, not on every message. */
  private readonly transport: (message: EmailMessage) => Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.from = this.config.get<string>('mail.from') ?? 'noreply@example.com';
    const driver = this.config.get<MailDriver>('mail.driver') ?? 'ses';
    this.transport =
      driver === 'smtp'
        ? this.createSmtpTransport()
        : this.createSesTransport();
  }

  private createSmtpTransport(): (message: EmailMessage) => Promise<void> {
    const host = this.config.get<string>('mail.smtp.host');
    const port = this.config.get<number>('mail.smtp.port') ?? 587;
    const user = this.config.get<string>('mail.smtp.user');
    const pass = this.config.get<string>('mail.smtp.pass');
    const transporter = createTransport({
      host,
      port,
      secure: this.config.get<boolean>('mail.smtp.secure') ?? false,
      // Mailtrap and most relays require auth; an internal relay on the same network may not.
      ...(user && pass ? { auth: { user, pass } } : {}),
    });

    this.logger.log(
      `Mail transport: SMTP ${host ?? '(no host)'}:${port}, sending as ${this.from}`,
      'EmailService',
    );

    return async (message) => {
      await transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    };
  }

  private createSesTransport(): (message: EmailMessage) => Promise<void> {
    const endpoint = this.config.get<string>('aws.endpoint');
    const accessKeyId = this.config.get<string>('aws.accessKeyId');
    const secretAccessKey = this.config.get<string>('aws.secretAccessKey');
    const client = new SESClient({
      region: this.config.get<string>('aws.region') ?? 'ap-southeast-1',
      ...(endpoint ? { endpoint } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.logger.log(
      `Mail transport: SES ${endpoint ?? 'aws'}, sending as ${this.from}`,
      'EmailService',
    );

    return async (message) => {
      await client.send(
        new SendEmailCommand({
          Source: this.from,
          Destination: { ToAddresses: [message.to] },
          Message: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
          },
        }),
      );
    };
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport(message);
  }

  /**
   * Sends and swallows the transport failure. A caller that reports the failure to the client
   * would turn "mail provider is down" into "this address is not registered" for anyone
   * watching the response, which is exactly the enumeration the forgot-password flow avoids.
   */
  async sendQuietly(message: EmailMessage): Promise<boolean> {
    try {
      await this.send(message);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" mail`,
        error instanceof Error ? error.stack : String(error),
        'EmailService',
      );
      return false;
    }
  }
}
