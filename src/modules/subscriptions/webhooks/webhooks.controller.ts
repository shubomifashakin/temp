import { type Request } from 'express';

import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Body, Controller, Post, Req } from '@nestjs/common';

import { PolarWebhooksService } from './polar-webhooks.service';

@Controller('webhooks/subscriptions')
export class WebhooksController {
  constructor(private readonly polarWebhooksService: PolarWebhooksService) {}

  @ApiOperation({ summary: 'handles webhook events from polar' })
  @ApiResponse({ status: 201, description: 'event handled successfully' })
  @Post('polar')
  async handleEvent(@Body() dto: any, @Req() req: Request) {
    return this.polarWebhooksService.handleEvent(dto, req.headers);
  }
}
