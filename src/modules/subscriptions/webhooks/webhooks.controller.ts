import { type Request } from 'express';

import { Body, Controller, Post, Req } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

@Controller('webhooks/subscriptions')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('polar')
  handleEvent(@Body() dto: any, @Req() req: Request) {
    this.webhooksService.handleEvent(dto, req.headers);
  }
}
