import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    description: 'The full permission set the role should hold after the save',
    isArray: true,
    type: String,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permissions: string[];
}
