import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

import { FileEventsDto } from './common/dtos/file-events.dto';
import { WebhooksGuard } from './common/guards/webhooks.guard';

@UseGuards(WebhooksGuard)
@Controller('webhooks/files')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  handleEvent(@Body() dto: FileEventsDto) {
    return this.webhooksService.handleFileEvents(dto);
  }
}
