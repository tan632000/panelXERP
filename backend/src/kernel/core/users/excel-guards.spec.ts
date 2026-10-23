import { PERMISSIONS_KEY } from '@kernel/core/auth/decorators/auth.decorators';
import {
  USER_EXPORT,
  USER_IMPORT,
} from '@kernel/core/users/constants/user-permission.constant';
import { UsersController } from '@kernel/core/users/users.controller';

type Guard = readonly [string, { prototype: object }, string, string, string];

const IMPORT_GUARDS: readonly Guard[] = [
  ['users import', UsersController, 'importUsers', USER_IMPORT, 'user:import'],
];

const EXPORT_GUARDS: readonly Guard[] = [
  ['users export', UsersController, 'export', USER_EXPORT, 'user:export'],
];

function guardOf(controller: { prototype: object }, method: string): unknown {
  const handler = Object.getOwnPropertyDescriptor(controller.prototype, method)
    ?.value as object;
  return Reflect.getMetadata(PERMISSIONS_KEY, handler);
}

describe('users Excel import guards', () => {
  it.each(IMPORT_GUARDS)(
    '%s is guarded by its own scope',
    (_name, controller, method, constant, value) => {
      expect(constant).toBe(value);
      expect(guardOf(controller, method)).toEqual([constant]);
    },
  );
});

describe('users Excel export guards', () => {
  it.each(EXPORT_GUARDS)(
    '%s is guarded by its own scope',
    (_name, controller, method, constant, value) => {
      expect(constant).toBe(value);
      expect(guardOf(controller, method)).toEqual([constant]);
    },
  );
});
