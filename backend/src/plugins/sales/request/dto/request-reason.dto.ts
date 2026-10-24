import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** The reason that closes a request without a sale: cancelling it, or losing the bid. */
export class RequestReasonDto {
  @ApiProperty({ description: 'Why the request is closed', maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Reason is required.' })
  @MinLength(1, { message: 'Reason is required.' })
  @MaxLength(1000, { message: 'Reason must not exceed 1000 characters.' })
  reason: string;
}
