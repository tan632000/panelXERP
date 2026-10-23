import { ConflictException } from '@nestjs/common';

import {
  assertBaseLineIds,
  BASE_LINES_CHANGED_CODE,
} from '@shared/utils/base-line-ids.util';

describe('assertBaseLineIds', () => {
  it('passes when the sets match regardless of order', () => {
    expect(() => assertBaseLineIds([2, 1], [1, 2])).not.toThrow();
  });

  it('rejects when baseLineIds is missing', () => {
    expect(() => assertBaseLineIds(undefined, [1, 2])).toThrow(
      ConflictException,
    );
  });

  it('rejects when a live line is missing from the base', () => {
    expect(() => assertBaseLineIds([1], [1, 2])).toThrow(ConflictException);
  });

  it('rejects when the base names a line that is gone, with the stable code', () => {
    try {
      assertBaseLineIds([1, 2, 3], [1, 2]);
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: BASE_LINES_CHANGED_CODE,
      });
    }
  });
});
