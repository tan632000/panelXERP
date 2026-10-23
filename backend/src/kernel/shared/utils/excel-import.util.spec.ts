import { BadRequestException, ConflictException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  runExcelImport,
  type ExcelImportHandler,
  type ExcelImportRowError,
} from '@shared/utils/excel-import.util';

import type { DataSource, EntityManager } from 'typeorm';

class LineDto {
  @IsString()
  @MinLength(1)
  productCode!: string;

  @IsInt()
  @IsPositive()
  qtyPcs!: number;
}

class CreateDto {
  @IsString()
  @MinLength(1)
  pic!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

class UpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  pic?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines?: LineDto[];
}

/** A manager whose `transaction` just runs the callback, recording each savepoint. */
function fakeDataSource(): {
  dataSource: DataSource;
  transaction: jest.Mock;
  savepoints: jest.Mock;
} {
  const savepoints = jest.fn();
  const manager: { transaction: jest.Mock } = {
    transaction: jest.fn((work: (m: EntityManager) => unknown) => {
      savepoints();
      return work(manager as unknown as EntityManager);
    }),
  };
  const transaction = jest.fn((work: (m: EntityManager) => unknown) =>
    work(manager as unknown as EntityManager),
  );
  const dataSource = { transaction } as unknown as DataSource;
  return { dataSource, transaction, savepoints };
}

interface HandlerMocks {
  findIdByCode: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
}

function handler(
  overrides: Partial<
    Omit<ExcelImportHandler<CreateDto, UpdateDto>, keyof HandlerMocks>
  > &
    Partial<HandlerMocks> = {},
): ExcelImportHandler<CreateDto, UpdateDto> & HandlerMocks {
  return {
    createDto: CreateDto,
    updateDto: UpdateDto,
    lineFields: ['lines'],
    createTakesCode: false,
    findIdByCode: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function rejectionOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  return (
    (error as BadRequestException).getResponse() as {
      errors: ExcelImportRowError[];
    }
  ).errors;
}

describe('runExcelImport', () => {
  it('creates a blank-code document and updates one whose code is active', async () => {
    const { dataSource } = fakeDataSource();
    const findIdByCode = jest
      .fn()
      .mockImplementation((code: string) =>
        Promise.resolve(code === 'SORT-2026-0001' ? 7 : undefined),
      );
    const imports = handler({ findIdByCode });

    const result = await runExcelImport(
      dataSource,
      [
        {
          fileRow: 2,
          pic: 'An',
          lines: [{ fileRow: 2, productCode: 'P1', qtyPcs: 3 }],
        },
        {
          fileRow: 3,
          code: 'SORT-2026-0001',
          pic: 'Binh',
          lines: [{ fileRow: 3, productCode: 'P2', qtyPcs: 4 }],
        },
      ],
      imports,
    );

    expect(result).toEqual({ created: 1, updated: 1 });
    const [created] = imports.create.mock.calls[0] as [CreateDto];
    expect(created).toBeInstanceOf(CreateDto);
    // The sheet bookkeeping never reaches the DTO the service sees.
    expect(created).toEqual({
      pic: 'An',
      lines: [{ productCode: 'P1', qtyPcs: 3 }],
    });
    expect(imports.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ pic: 'Binh' }),
      expect.anything(),
    );
  });

  it('blames a header rule on the document row and a line rule on the line row', async () => {
    const { dataSource } = fakeDataSource();
    const imports = handler();

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 2,
            pic: '',
            lines: [
              { fileRow: 2, productCode: 'P1', qtyPcs: 3 },
              { fileRow: 3, productCode: 'P2', qtyPcs: 0 },
            ],
          },
        ],
        imports,
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({ fileRow: 2, field: 'pic', code: 'minLength' }),
      expect.objectContaining({
        fileRow: 3,
        field: 'lines.qtyPcs',
        code: 'isPositive',
      }),
    ]);
    expect(imports.create).not.toHaveBeenCalled();
  });

  it('holds an update to the create rules, so a blank required cell is not "unchanged"', async () => {
    const { dataSource } = fakeDataSource();
    const imports = handler({ findIdByCode: jest.fn().mockResolvedValue(7) });

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 2,
            code: 'SORT-2026-0001',
            pic: '',
            lines: [{ fileRow: 2, productCode: 'P1', qtyPcs: 1 }],
          },
        ],
        imports,
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({ fileRow: 2, field: 'pic', code: 'minLength' }),
    ]);
    expect(imports.update).not.toHaveBeenCalled();
  });

  it('blames a nested line not addressed row by row on the document row, never dropping it', async () => {
    const { dataSource } = fakeDataSource();
    const imports = handler({ lineFields: [] });

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 6,
            pic: 'An',
            lines: [{ productCode: 'P1', qtyPcs: -1 }],
          },
        ],
        imports,
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({
        fileRow: 6,
        field: 'lines.qtyPcs',
        code: 'isPositive',
      }),
    ]);
    expect(imports.create).not.toHaveBeenCalled();
  });

  it('reports a code the server would have to allocate but no record holds', async () => {
    const { dataSource } = fakeDataSource();

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 4,
            code: 'SORT-2026-9999',
            pic: 'An',
            lines: [{ fileRow: 4, productCode: 'P1', qtyPcs: 1 }],
          },
        ],
        handler(),
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({ fileRow: 4, code: 'codeNotFound' }),
    ]);
  });

  it('creates an unknown code when the create payload carries codes', async () => {
    const { dataSource } = fakeDataSource();
    const imports = handler({ createTakesCode: true });
    class CodedCreateDto extends CreateDto {
      @IsString()
      code!: string;
    }
    imports.createDto = CodedCreateDto;

    await runExcelImport(
      dataSource,
      [
        {
          fileRow: 2,
          code: ' NG-2026-0001 ',
          pic: 'An',
          lines: [{ fileRow: 2, productCode: 'P1', qtyPcs: 1 }],
        },
      ],
      imports,
    );

    expect(imports.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NG-2026-0001' }),
      expect.anything(),
    );
  });

  it('allocates a code for a blank-code document whose create payload requires one', async () => {
    const { dataSource } = fakeDataSource();
    class CodedCreateDto extends CreateDto {
      @IsString()
      @MinLength(1)
      code!: string;
    }
    const allocateCode = jest
      .fn()
      .mockResolvedValueOnce('NG-2026-0007')
      .mockResolvedValueOnce('NG-2026-0008');
    const imports = handler({ createTakesCode: true, allocateCode });
    imports.createDto = CodedCreateDto;
    const line = { productCode: 'P1', qtyPcs: 1 };

    await runExcelImport(
      dataSource,
      [
        { fileRow: 2, pic: 'An', lines: [{ ...line, fileRow: 2 }] },
        { fileRow: 3, pic: 'Binh', lines: [{ ...line, fileRow: 3 }] },
      ],
      imports,
    );

    expect(
      imports.create.mock.calls.map(([dto]) => dto as CodedCreateDto),
    ).toEqual([
      expect.objectContaining({ code: 'NG-2026-0007', pic: 'An' }),
      expect.objectContaining({ code: 'NG-2026-0008', pic: 'Binh' }),
    ]);
  });

  it('rejects a code repeated across documents before touching the database', async () => {
    const { dataSource, transaction } = fakeDataSource();
    const line = { fileRow: 2, productCode: 'P1', qtyPcs: 1 };

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          { fileRow: 2, code: 'A-1', pic: 'An', lines: [line] },
          { fileRow: 5, code: 'a-1', pic: 'An', lines: [line] },
        ],
        handler(),
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({ fileRow: 5, code: 'duplicateCode' }),
    ]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("keeps judging after a service rule fails and reports each document's own reason", async () => {
    const { dataSource, savepoints } = fakeDataSource();
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        new BadRequestException('Sorting order date cannot be in the future.'),
      )
      .mockRejectedValueOnce(new ConflictException('Code already exists.'));
    const line = { productCode: 'P1', qtyPcs: 1 };

    const errors = await rejectionOf(
      runExcelImport(
        dataSource,
        [
          { fileRow: 2, pic: 'An', lines: [{ ...line, fileRow: 2 }] },
          { fileRow: 3, pic: 'Binh', lines: [{ ...line, fileRow: 3 }] },
        ],
        handler({ create }),
      ),
    );

    expect(savepoints).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([
      {
        fileRow: 2,
        code: 'rejected',
        message: 'Sorting order date cannot be in the future.',
      },
      { fileRow: 3, code: 'rejected', message: 'Code already exists.' },
    ]);
  });

  it('lets a fault that is not a business rule escape as it is', async () => {
    const { dataSource } = fakeDataSource();
    const fault = new Error('connection reset');

    await expect(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 2,
            pic: 'An',
            lines: [{ fileRow: 2, productCode: 'P1', qtyPcs: 1 }],
          },
        ],
        handler({ create: jest.fn().mockRejectedValue(fault) }),
      ),
    ).rejects.toBe(fault);
  });

  it('refuses a document or line with no file row to blame', async () => {
    const { dataSource, transaction } = fakeDataSource();

    await expect(
      runExcelImport(
        dataSource,
        [
          {
            fileRow: 2,
            pic: 'An',
            lines: [{ productCode: 'P1', qtyPcs: 1 }],
          },
        ],
        handler(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
