import { Controller, Post } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

import { PolarEventDto } from './common/dtos/polar-event.dto';

@Controller('webhooks/subscriptions')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  handleEvent(dto: PolarEventDto) {
    this.webhooksService.handleEvent(dto);
  }
}
