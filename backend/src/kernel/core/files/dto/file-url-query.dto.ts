import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FileUrlQueryDto {
  @ApiPropertyOptional({
    enum: ['inline', 'attachment'],
    description:
      'How the browser should treat the object. `inline` views it, `attachment` saves it.',
  })
  @IsOptional()
  @IsIn(['inline', 'attachment'])
  disposition?: 'inline' | 'attachment';

  @ApiPropertyOptional({
    description:
      'Name the saved file should carry. Only used with `disposition=attachment`.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
