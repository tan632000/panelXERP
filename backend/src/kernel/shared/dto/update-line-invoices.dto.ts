import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

/**
 * One line's invoice fields. A field left out keeps its stored value; `null` or an empty
 * string clears it. A document whose lines keep no template/series ignores those two.
 */
export class LineInvoiceDto {
  @ApiProperty({ description: 'Id of the document line' })
  @Type(() => Number)
  @IsInt()
  id: number;

  @ApiPropertyOptional({
    description: 'Invoice number',
    maxLength: 50,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNo?: string | null;

  @ApiPropertyOptional({ description: 'Invoice date', nullable: true })
  @IsOptional()
  @IsDateOnly()
  invoiceDate?: string | null;

  @ApiPropertyOptional({
    description: 'Invoice template',
    maxLength: 20,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoiceForm?: string | null;

  @ApiPropertyOptional({
    description: 'Invoice series symbol',
    maxLength: 20,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoiceSerial?: string | null;
}

/** The invoice-only update of a document: no other field of the document or its lines moves. */
export class UpdateLineInvoicesDto {
  @ApiProperty({ type: [LineInvoiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineInvoiceDto)
  lines: LineInvoiceDto[];
}
