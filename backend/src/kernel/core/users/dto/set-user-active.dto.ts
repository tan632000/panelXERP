import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetUserActiveDto {
  @ApiProperty({
    description: 'False deactivates the account and revokes its sessions',
  })
  @IsBoolean()
  isActive: boolean;
}
