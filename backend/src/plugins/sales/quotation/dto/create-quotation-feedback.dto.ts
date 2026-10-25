import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { IsDateOnly } from '@shared/validators/is-date-only.validator';

import { QuotationFeedbackChannel } from '@plugins/sales/quotation/enums/quotation-feedback-channel.enum';

export const MAX_FEEDBACK_LENGTH = 2000;

export class CreateQuotationFeedbackDto {
  @ApiProperty({
    description: 'The day the customer answered (YYYY-MM-DD)',
    example: '2027-01-20',
  })
  @IsDateOnly()
  feedbackDate: string;

  @ApiProperty({ enum: QuotationFeedbackChannel })
  @IsEnum(QuotationFeedbackChannel, {
    message: 'Channel must be phone, email, meeting, chat or other.',
  })
  channel: QuotationFeedbackChannel;

  @ApiProperty({
    description: 'What the customer said',
    maxLength: MAX_FEEDBACK_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Content is required.' })
  @MinLength(1, { message: 'Content is required.' })
  @MaxLength(MAX_FEEDBACK_LENGTH, {
    message: `Content must not exceed ${MAX_FEEDBACK_LENGTH} characters.`,
  })
  content: string;
}
