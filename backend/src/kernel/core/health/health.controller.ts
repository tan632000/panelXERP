import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@kernel/core/auth/decorators/auth.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @ApiOperation({
    summary: 'Report service liveness',
    security: [],
  })
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
