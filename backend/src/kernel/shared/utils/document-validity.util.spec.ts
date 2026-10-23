import { buildValidityStateSql } from '@shared/utils/document-validity.sql';
import {
  appToday,
  computeExpiryDate,
  computeValidityState,
  EXPIRY_WARNING_DAYS,
  wholeDaysBetween,
} from '@shared/utils/document-validity.util';

describe('appToday', () => {
  it('takes the date in the application offset, not in UTC', () => {
    // 22:30 UTC is already the next day at +07:00.
    expect(appToday(new Date('2026-03-02T22:30:00Z'))).toBe('2026-03-03');
    expect(appToday(new Date('2026-03-02T10:00:00Z'))).toBe('2026-03-02');
  });

  it('rolls the date exactly at 17:00 UTC', () => {
    expect(appToday(new Date('2026-03-02T16:59:59Z'))).toBe('2026-03-02');
    expect(appToday(new Date('2026-03-02T17:00:00Z'))).toBe('2026-03-03');
  });
});

describe('wholeDaysBetween', () => {
  it('counts whole days in both directions', () => {
    expect(wholeDaysBetween('2026-03-02', '2026-03-05')).toBe(3);
    expect(wholeDaysBetween('2026-03-05', '2026-03-02')).toBe(-3);
    expect(wholeDaysBetween('2026-03-02', '2026-03-02')).toBe(0);
  });

  it('crosses a leap day without drifting', () => {
    expect(wholeDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(wholeDaysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('rejects a date the calendar does not have', () => {
    expect(wholeDaysBetween('2026-02-31', '2026-03-01')).toBeNull();
    expect(wholeDaysBetween('2026-13-01', '2026-03-01')).toBeNull();
  });
});

describe('computeExpiryDate', () => {
  it('adds a month span keeping the day of month', () => {
    expect(computeExpiryDate('2026-01-10', 12, 'month')).toBe('2027-01-10');
    expect(computeExpiryDate('2026-01-10', 1, 'month')).toBe('2026-02-10');
  });

  it('clamps to the month end where the target month is shorter', () => {
    // 31 January plus one month is the end of February, never 3 March.
    expect(computeExpiryDate('2026-01-31', 1, 'month')).toBe('2026-02-28');
    expect(computeExpiryDate('2028-01-31', 1, 'month')).toBe('2028-02-29');
  });

  it('adds a year span and clamps 29 February', () => {
    expect(computeExpiryDate('2026-03-15', 2, 'year')).toBe('2028-03-15');
    expect(computeExpiryDate('2028-02-29', 1, 'year')).toBe('2029-02-28');
  });

  it('adds a day span across a month boundary', () => {
    expect(computeExpiryDate('2026-01-30', 5, 'day')).toBe('2026-02-04');
  });

  it('treats a zero span as expiring on the sign date', () => {
    expect(computeExpiryDate('2026-03-02', 0, 'month')).toBe('2026-03-02');
  });

  it('has no expiry when the validity is unlimited', () => {
    expect(computeExpiryDate('2026-03-02', 24, 'unlimited')).toBeNull();
  });

  it('has no expiry when the sign date or the value is missing', () => {
    expect(computeExpiryDate(null, 12, 'month')).toBeNull();
    expect(computeExpiryDate('2026-03-02', null, 'month')).toBeNull();
    expect(computeExpiryDate('2026-03-02', undefined, 'month')).toBeNull();
  });
});

describe('computeValidityState', () => {
  const today = '2026-03-02';

  it('reports locked ahead of every date outcome', () => {
    // The whole point of the lock: a lapsed expiry stops being reported.
    expect(
      computeValidityState({ locked: true, expiryDate: '2026-01-20' }, today),
    ).toBe('locked');
    expect(
      computeValidityState({ locked: true, expiryDate: '2030-01-20' }, today),
    ).toBe('locked');
    expect(
      computeValidityState({ locked: true, expiryDate: null }, today),
    ).toBe('locked');
  });

  it('reports unlimited when there is no expiry date', () => {
    expect(
      computeValidityState({ locked: false, expiryDate: null }, today),
    ).toBe('unlimited');
  });

  it('treats both ends of the warning window as inclusive', () => {
    const at = (expiryDate: string) =>
      computeValidityState({ locked: false, expiryDate }, today);
    // Exactly 30 days out is still a warning; 31 is not.
    expect(at('2026-04-01')).toBe('expiringSoon');
    expect(at('2026-04-02')).toBe('valid');
    // Today is a warning, yesterday is expired.
    expect(at('2026-03-02')).toBe('expiringSoon');
    expect(at('2026-03-01')).toBe('expired');
  });

  it('keeps the whole expiry date valid, expiring only the day after', () => {
    // Validity runs 00:00 of the sign date through 23:59 of the expiry date, so the expiry
    // date is an inclusive last day. Tightening this to `<= 0` would expire every document
    // one day early.
    const at = (expiryDate: string) =>
      computeValidityState({ locked: false, expiryDate }, today);
    expect(at(today)).not.toBe('expired');
    expect(at('2026-03-01')).toBe('expired');
  });

  it('keeps the warning window at thirty days', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(30);
  });

  it('anchors on the comparison date, not on when the document was created', () => {
    // A twelve-month contract signed 2026-01-10 expires 2027-01-10. Read in December it is
    // three weeks from expiry; anchoring on the creation date would report it as valid and
    // hide exactly the warning this feature exists to produce.
    const expiryDate = computeExpiryDate('2026-01-10', 12, 'month');
    expect(expiryDate).toBe('2027-01-10');
    expect(
      computeValidityState({ locked: false, expiryDate }, '2026-12-20'),
    ).toBe('expiringSoon');
    expect(
      computeValidityState({ locked: false, expiryDate }, '2026-01-10'),
    ).toBe('valid');
  });
});

describe('buildValidityStateSql', () => {
  it('emits the rule for a supplied table alias, not a fixed one', () => {
    const sql = buildValidityStateSql('doc');
    expect(sql).toContain('WHEN "doc"."locked"');
    expect(sql).toContain('"doc"."expiry_date"');
    expect(sql).not.toContain('"document"."locked"');
  });

  it('keeps one SQL definition of the window and the application offset', () => {
    const sql = buildValidityStateSql('sales_document');
    expect(sql).toContain('+ 30');
    expect(sql).toContain("'Asia/Ho_Chi_Minh'");
    expect(sql).toContain('WHEN "sales_document"."locked" THEN \'locked\'');
    expect(sql).toContain(
      '"sales_document"."expiry_date" IS NULL THEN \'unlimited\'',
    );
  });

  it('produces distinct SQL per alias so two features never collide', () => {
    const procurementSql = buildValidityStateSql('document');
    const salesSql = buildValidityStateSql('sales_document');
    expect(procurementSql).not.toBe(salesSql);
    expect(procurementSql).toContain('"document"');
    expect(salesSql).toContain('"sales_document"');
  });
});

describe('TypeScript and SQL forms agree on the boundary', () => {
  // The SQL comparator is a plain `<`/`<=` against `expiry_date`, `today`, and `today + 30`,
  // which is exactly the arithmetic `wholeDaysBetween` performs; these three cases pin both
  // sides to the same three states so a change to one form without the other is caught here.
  const today = '2026-03-02';

  it('lands on expiringSoon at exactly thirty days out, matching the SQL `<=` branch', () => {
    expect(wholeDaysBetween(today, '2026-04-01')).toBe(30);
    expect(
      computeValidityState({ locked: false, expiryDate: '2026-04-01' }, today),
    ).toBe('expiringSoon');
    // The SQL side adds the same thirty as a non-strict upper bound on the same comparison date.
    expect(buildValidityStateSql('doc')).toMatch(
      /<= \(now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)::date \+ 30/,
    );
  });

  it('lands on expiringSoon at the comparison date itself, matching the SQL non-strict `<`', () => {
    expect(wholeDaysBetween(today, today)).toBe(0);
    expect(
      computeValidityState({ locked: false, expiryDate: today }, today),
    ).toBe('expiringSoon');
  });

  it('lands on expired one day earlier, matching the SQL strict `<` branch', () => {
    expect(wholeDaysBetween(today, '2026-03-01')).toBe(-1);
    expect(
      computeValidityState({ locked: false, expiryDate: '2026-03-01' }, today),
    ).toBe('expired');
    const sql = buildValidityStateSql('doc');
    expect(sql).toMatch(/"expiry_date" < \(now\(\)/);
  });
});
