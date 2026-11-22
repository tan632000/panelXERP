import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import { REPRESENTATIVE_NAME_MAX } from '@plugins/delivery/acceptance/constants/acceptance.constant';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** The text fields of the multipart create request; the files travel beside them. */
export class CreateAcceptanceDto {
  @ApiProperty({ maxLength: REPRESENTATIVE_NAME_MAX })
  @Transform(trim)
  @IsString({ message: 'Representative name is required.' })
  @MinLength(1, { message: 'Representative name is required.' })
  @MaxLength(REPRESENTATIVE_NAME_MAX, {
    message: `Representative name must not exceed ${REPRESENTATIVE_NAME_MAX} characters.`,
  })
  representativeName: string;

  @ApiProperty({
    example: '2026-12-20',
    description:
      'Vietnam date: not before the latest receipt of the order, not in the future',
  })
  @IsDateOnly()
  signedDate: string;
}
