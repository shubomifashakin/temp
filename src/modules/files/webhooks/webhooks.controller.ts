import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { WebhooksService } from './webhooks.service';

import { FileEventsDto } from './common/dtos/file-events.dto';
import { WebhooksGuard } from './common/guards/webhooks.guard';

@ApiHeader({
  required: true,
  name: 'x-signature',
  description: 'Webhook signature for verification',
})
@UseGuards(WebhooksGuard)
@Controller('webhooks/files')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @ApiOperation({ summary: 'Handle file events from external services' })
  @ApiBody({ type: FileEventsDto })
  @ApiResponse({ status: 200, description: 'Event processed successfully' })
  @Post()
  handleEvent(@Body() dto: FileEventsDto) {
    return this.webhooksService.handleFileEvents(dto);
  }
}
