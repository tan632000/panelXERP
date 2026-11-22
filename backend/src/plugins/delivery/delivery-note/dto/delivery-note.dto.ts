import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ListFilterQueryDto } from '@shared/dto/list-filter.dto';
import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import {
  DELIVERY_ADDRESS_MAX,
  DELIVERY_NOTE_TEXT_MAX,
  DeliveryNoteStatus,
  RECEIVER_NAME_MAX,
} from '@plugins/delivery/delivery-note/constants/delivery-note.constant';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDeliveryNoteDto {
  @ApiProperty({
    description: 'The in_production order the cabinets belong to',
  })
  @Type(() => Number)
  @IsInt({ message: 'Order is required.' })
  @Min(1, { message: 'Order is required.' })
  @Max(2147483647)
  orderId: number;

  @ApiProperty({
    type: [Number],
    description: 'QC-passed cabinets of the order that are on no live note',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one cabinet.' })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  unitIds: number[];

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateOnly()
  plannedDate?: string;

  @ApiPropertyOptional({
    maxLength: DELIVERY_ADDRESS_MAX,
    description:
      'Defaults to the project site address, else the customer address',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(DELIVERY_ADDRESS_MAX, {
    message: `Address must not exceed ${DELIVERY_ADDRESS_MAX} characters.`,
  })
  deliveryAddress?: string;

  @ApiPropertyOptional({ maxLength: DELIVERY_NOTE_TEXT_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(DELIVERY_NOTE_TEXT_MAX, {
    message: `Note must not exceed ${DELIVERY_NOTE_TEXT_MAX} characters.`,
  })
  note?: string;
}

/** The text fields of the multipart receive request; the files travel beside them. */
export class ReceiveDeliveryNoteDto {
  @ApiProperty({ maxLength: RECEIVER_NAME_MAX })
  @Transform(trim)
  @IsString({ message: 'Receiver name is required.' })
  @MinLength(1, { message: 'Receiver name is required.' })
  @MaxLength(RECEIVER_NAME_MAX, {
    message: `Receiver name must not exceed ${RECEIVER_NAME_MAX} characters.`,
  })
  receiverName: string;

  @ApiProperty({
    example: '2026-12-02',
    description:
      'Vietnam date: not before the shipping date, not in the future',
  })
  @IsDateOnly()
  receivedDate: string;
}

export class CancelDeliveryNoteDto {
  @ApiProperty({ maxLength: DELIVERY_NOTE_TEXT_MAX })
  @Transform(trim)
  @IsString({ message: 'Reason is required.' })
  @MinLength(1, { message: 'Reason is required.' })
  @MaxLength(DELIVERY_NOTE_TEXT_MAX, {
    message: `Reason must not exceed ${DELIVERY_NOTE_TEXT_MAX} characters.`,
  })
  reason: string;
}

export class DeliveryNoteFilterDto extends ListFilterQueryDto {
  @ApiPropertyOptional({ enum: DeliveryNoteStatus })
  @IsOptional()
  @IsEnum(DeliveryNoteStatus, { message: 'Unknown delivery note status.' })
  status?: DeliveryNoteStatus;

  @ApiPropertyOptional({ description: 'Only the notes of this sales order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId?: number;
}
