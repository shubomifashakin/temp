import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { HealthService } from './health.service';

import { HealthDto } from './entities/health.dto';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: 200,
    type: HealthDto,
    description: 'Health check response',
  })
  @Get()
  getHealth(): HealthDto {
    return this.healthService.getHealth();
  }
}
