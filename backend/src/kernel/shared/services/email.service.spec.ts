import { SESClient } from '@aws-sdk/client-ses';
import { createTransport } from 'nodemailer';

import { EmailService } from '@shared/services/email.service';

import type { ConfigService } from '@nestjs/config';
import type { LoggerService } from '@shared/logger/logger.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));

const MESSAGE = {
  to: 'user@example.com',
  subject: 'Password reset request',
  text: 'Open the link below',
};

function buildService(values: Record<string, unknown>): EmailService {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  } as unknown as LoggerService;
  return new EmailService(config, logger);
}

describe('EmailService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends through SMTP when the driver resolves to smtp', async () => {
    const service = buildService({
      'mail.driver': 'smtp',
      'mail.from': 'noreply@example.com',
      'mail.smtp.host': 'sandbox.smtp.mailtrap.io',
      'mail.smtp.port': 2525,
      'mail.smtp.secure': false,
      'mail.smtp.user': 'inbox-user',
      'mail.smtp.pass': 'inbox-pass',
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'sandbox.smtp.mailtrap.io',
      port: 2525,
      secure: false,
      auth: { user: 'inbox-user', pass: 'inbox-pass' },
    });

    await service.send(MESSAGE);

    const transport = (createTransport as jest.Mock).mock.results[0].value as {
      sendMail: jest.Mock;
    };
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      text: MESSAGE.text,
    });
  });

  it('omits SMTP auth when no credentials are configured', () => {
    buildService({
      'mail.driver': 'smtp',
      'mail.smtp.host': 'relay.internal',
      'mail.smtp.port': 25,
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'relay.internal',
      port: 25,
      secure: false,
    });
  });

  it('sends through SES when the driver resolves to ses', async () => {
    const send = jest
      .spyOn(SESClient.prototype, 'send')
      .mockResolvedValue(undefined as never);
    const service = buildService({
      'mail.driver': 'ses',
      'mail.from': 'noreply@example.com',
      'aws.region': 'ap-southeast-1',
    });

    await service.send(MESSAGE);

    expect(createTransport).not.toHaveBeenCalled();
    const command = send.mock.calls[0][0] as unknown as {
      input: { Source: string; Destination: { ToAddresses: string[] } };
    };
    expect(command.input.Source).toBe('noreply@example.com');
    expect(command.input.Destination.ToAddresses).toEqual([MESSAGE.to]);
    send.mockRestore();
  });

  it('reports a transport failure as false instead of throwing', async () => {
    const service = buildService({
      'mail.driver': 'smtp',
      'mail.smtp.host': 'relay.internal',
    });
    const transport = (createTransport as jest.Mock).mock.results[0].value as {
      sendMail: jest.Mock;
    };
    transport.sendMail.mockRejectedValue(new Error('connection refused'));

    await expect(service.sendQuietly(MESSAGE)).resolves.toBe(false);
  });
});
