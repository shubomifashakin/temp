import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';
import { FileEventsDto } from './common/dtos/file-events.dto';
import { WebhooksGuard } from './common/guards/webhooks.guard';

@Controller('files/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @UseGuards(WebhooksGuard)
  @Post()
  handleEvent(@Body() dto: FileEventsDto) {
    return this.webhooksService.handleFileEvents(dto);
  }
}
