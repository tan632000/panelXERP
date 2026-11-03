import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { UpdateProductionUnitDto } from '@plugins/production/production-order/dto/production-order.dto';

function refusedFields(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(UpdateProductionUnitDto, body);
  return validateSync(dto).map((e) => e.property);
}

describe('UpdateProductionUnitDto', () => {
  it('leaves a field that is not sent as it is', () => {
    expect(refusedFields({})).toEqual([]);
    expect(refusedFields({ plannedEndDate: '2026-12-31' })).toEqual([]);
    expect(refusedFields({ assigneeId: 7 })).toEqual([]);
  });

  it('refuses null, which would clear what a released cabinet must keep', () => {
    // A cleared date leaves a released cabinet without a deadline and its overdue notice
    // without anything that could ever clear it.
    expect(refusedFields({ plannedEndDate: null })).toEqual(['plannedEndDate']);
    expect(refusedFields({ assigneeId: null })).toEqual(['assigneeId']);
  });

  it('refuses a year still being typed', () => {
    expect(refusedFields({ plannedEndDate: '0002-11-25' })).toEqual([
      'plannedEndDate',
    ]);
    expect(refusedFields({ plannedEndDate: '2000-01-01' })).toEqual([]);
  });
});
