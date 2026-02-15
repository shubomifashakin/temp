import { type Request } from 'express';

import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  Post,
  Req,
  Logger,
  UseGuards,
  Controller,
  InternalServerErrorException,
} from '@nestjs/common';

import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarWebhookGuard } from './common/guards/polar-webhook.guard';

@Controller('webhooks/subscriptions')
export class WebhooksController {
  logger = new Logger(WebhooksController.name);

  constructor(private readonly polarWebhooksService: PolarWebhooksService) {}

  @UseGuards(PolarWebhookGuard)
  @ApiOperation({ summary: 'handles webhook events from polar' })
  @ApiResponse({ status: 201, description: 'event handled successfully' })
  @Post('polar')
  async handleEvent(@Req() req: Request) {
    if (!req.polarEvent) {
      this.logger.error({
        message: 'No polar event in request',
      });

      throw new InternalServerErrorException();
    }

    const { type, data, timestamp } = req.polarEvent;

    return this.polarWebhooksService.handleEvent(type, data, timestamp);
  }
}
