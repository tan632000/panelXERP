import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';

describe('vnToday', () => {
  it('is already the next day in Vietnam at 23:30 UTC', () => {
    expect(vnToday(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03');
  });

  it('is still the same day just before 17:00 UTC', () => {
    expect(vnToday(new Date('2026-11-02T16:59:59Z'))).toBe('2026-11-02');
    expect(vnToday(new Date('2026-11-02T17:00:00Z'))).toBe('2026-11-03');
  });

  it('takes the year and month across the boundary', () => {
    expect(vnToday(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });

  it('defaults to the current instant', () => {
    jest.useFakeTimers({ now: new Date('2026-11-02T23:30:00Z') });
    try {
      expect(vnToday()).toBe('2026-11-03');
    } finally {
      jest.useRealTimers();
    }
  });
});
