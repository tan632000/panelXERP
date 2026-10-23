import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email address the reset link is sent to' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;
}
