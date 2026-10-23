import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, Matches, ValidateNested } from 'class-validator';

import { EXCEL_FILE_NAME_PATTERN } from '@kernel/core/files/excel-job.constants';
import { UserFilterDto } from '@kernel/core/users/dto/user-filter.dto';

import { ExcelSheetSpecDto } from '@shared/dto/excel-sheet-spec.dto';

/** Queues an Excel export of the account list as the reader sees it. */
export class UserExportDto {
  @ApiProperty({
    type: UserFilterDto,
    description:
      'The list search, filters, column filters and sort in force; page and limit are ignored',
  })
  @ValidateNested()
  @Type(() => UserFilterDto)
  query!: UserFilterDto;

  @ApiProperty({ type: ExcelSheetSpecDto })
  @ValidateNested()
  @Type(() => ExcelSheetSpecDto)
  sheet!: ExcelSheetSpecDto;

  @ApiProperty({
    description: 'File name without extension',
    example: 'nguoi-dung_2026-10-14',
  })
  @IsString()
  @Matches(EXCEL_FILE_NAME_PATTERN)
  fileName!: string;
}
