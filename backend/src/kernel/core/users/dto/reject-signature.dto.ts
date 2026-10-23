import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { SIGNATURE_REJECTION_REASON_MAX_LENGTH } from '@kernel/core/auth/constants/signature-review.constant';

export class RejectSignatureDto {
  @ApiProperty({
    maxLength: SIGNATURE_REJECTION_REASON_MAX_LENGTH,
    description: 'Shown to the account holder on their profile',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(SIGNATURE_REJECTION_REASON_MAX_LENGTH)
  reason: string;
}
