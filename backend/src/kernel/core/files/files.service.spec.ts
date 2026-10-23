import { NotFoundException } from '@nestjs/common';

import { FilesService } from '@kernel/core/files/files.service';

import type { S3StorageService } from '@shared/services/s3-storage.service';

describe('FilesService signed URLs', () => {
  const encode = (key: string) =>
    Buffer.from(key, 'utf8').toString('base64url');
  let s3: { getSignedUrl: jest.Mock };
  let service: FilesService;

  beforeEach(() => {
    s3 = { getSignedUrl: jest.fn().mockResolvedValue('https://s3/signed') };
    service = new FilesService(s3 as unknown as S3StorageService);
  });

  it('asks for no content disposition when the file is only viewed', async () => {
    await service.getSignedUrl(encode('documents/a.pdf'), {
      disposition: 'inline',
    });
    expect(s3.getSignedUrl).toHaveBeenCalledWith(
      'documents/a.pdf',
      3600,
      undefined,
    );
  });

  it('treats a missing disposition as a view', async () => {
    await service.getSignedUrl(encode('documents/a.pdf'));
    expect(s3.getSignedUrl).toHaveBeenCalledWith(
      'documents/a.pdf',
      3600,
      undefined,
    );
  });

  it('saves under the caller file name when downloading', async () => {
    await service.getSignedUrl(encode('documents/generated-123.pdf'), {
      disposition: 'attachment',
      fileName: 'NDA 2026.pdf',
    });
    const [, , options] = s3.getSignedUrl.mock.calls[0] as [
      string,
      number,
      { responseContentDisposition: string },
    ];
    expect(options.responseContentDisposition).toBe(
      `attachment; filename="NDA 2026.pdf"; filename*=UTF-8''NDA%202026.pdf`,
    );
  });

  it('keeps a non-ascii name readable and supplies an ascii fallback', async () => {
    await service.getSignedUrl(encode('documents/x.pdf'), {
      disposition: 'attachment',
      fileName: 'Hợp đồng.pdf',
    });
    const [, , options] = s3.getSignedUrl.mock.calls[0] as [
      string,
      number,
      { responseContentDisposition: string },
    ];
    expect(options.responseContentDisposition).toContain(
      "filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng.pdf",
    );
    expect(options.responseContentDisposition).toContain('filename="H');
  });

  it('falls back to the stored key name when no file name is given', async () => {
    await service.getSignedUrl(encode('documents/generated-123.pdf'), {
      disposition: 'attachment',
    });
    const [, , options] = s3.getSignedUrl.mock.calls[0] as [
      string,
      number,
      { responseContentDisposition: string },
    ];
    expect(options.responseContentDisposition).toContain(
      'filename="generated-123.pdf"',
    );
  });

  it('treats a blank file name as absent rather than empty', async () => {
    await service.getSignedUrl(encode('documents/generated-123.pdf'), {
      disposition: 'attachment',
      fileName: '   ',
    });
    const [, , options] = s3.getSignedUrl.mock.calls[0] as [
      string,
      number,
      { responseContentDisposition: string },
    ];
    expect(options.responseContentDisposition).toContain(
      'filename="generated-123.pdf"',
    );
  });

  it('refuses a key that escapes its prefix', async () => {
    await expect(
      service.getSignedUrl(encode('../../etc/passwd')),
    ).rejects.toThrow(NotFoundException);
    expect(s3.getSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses an absolute key', async () => {
    await expect(service.getSignedUrl(encode('/etc/passwd'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
