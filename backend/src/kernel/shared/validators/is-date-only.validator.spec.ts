import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

class DatedDocumentFixture {
  @IsDateOnly()
  signDate!: string;
}

function errorsFor(signDate: string): string[] {
  const dto = plainToInstance(DatedDocumentFixture, { signDate });
  return validateSync(dto)
    .filter((e) => e.property === 'signDate')
    .flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('IsDateOnly on document dates', () => {
  it('accepts the calendar date the validity rules parse', () => {
    expect(errorsFor('2026-01-10')).toEqual([]);
  });

  it('refuses a full timestamp', () => {
    // The regression this pins: `@IsISO8601()` accepted this, then every validity rule
    // rejected it, persisting a dated document that reported itself as unlimited.
    expect(errorsFor('2026-01-10T00:00:00.000Z')).toContain('isDateOnly');
    expect(errorsFor('2026-01-10T07:30:00+07:00')).toContain('isDateOnly');
  });

  it('refuses a date the calendar does not have', () => {
    expect(errorsFor('2026-02-31')).toContain('isDateOnly');
    expect(errorsFor('2026-13-01')).toContain('isDateOnly');
  });

  it('refuses a shape the rules cannot parse', () => {
    expect(errorsFor('10/01/2026')).toContain('isDateOnly');
    expect(errorsFor('2026-1-10')).toContain('isDateOnly');
  });
});
