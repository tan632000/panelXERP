import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import { FilesController } from '@kernel/core/files/files.controller';
import {
  FILE_READ,
  FILE_WRITE,
} from '@kernel/core/files/permissions/file.permissions';

function permissionsOf(handler: keyof FilesController): unknown {
  return Reflect.getMetadata(
    PERMISSIONS_KEY,
    FilesController.prototype[handler],
  );
}

describe('FilesController authorization', () => {
  it('guards upload with the kernel file write scope', () => {
    expect(permissionsOf('upload')).toEqual([FILE_WRITE]);
  });

  it('guards the signed-URL route with the kernel file read scope', () => {
    expect(permissionsOf('getUrl')).toEqual([FILE_READ]);
  });

  it('does not import a permission constant from a plugin', () => {
    // A kernel route that depends on one plugin's scopes locks every other module out of
    // file storage, which is exactly the defect these scopes replaced.
    const source = readFileSync(join(__dirname, 'files.controller.ts'), 'utf8');
    expect(source).not.toContain('@plugins/');
  });
});
