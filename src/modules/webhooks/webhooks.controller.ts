import { type Request } from 'express';

import {
  Req,
  Body,
  Post,
  Logger,
  Controller,
  UseGuards,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiExtraModels,
} from '@nestjs/swagger';

import { WebhooksService } from './webhooks.service';

import {
  FileEventsDto,
  FileDeletedEventPayload,
  FileValidatedEventPayload,
} from './common/dtos/file-events.dto';
import { FilesWebhooksGuard } from './common/guards/files-webhook.guard';
import { PolarWebhookGuard } from './common/guards/polar-webhook.guard';

@ApiExtraModels(FileDeletedEventPayload, FileValidatedEventPayload)
@Controller('webhooks')
export class WebhooksController {
  private logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @ApiHeader({
    required: true,
    name: 'x-signature',
    description: 'Webhook signature for verification',
  })
  @UseGuards(FilesWebhooksGuard)
  @ApiOperation({ summary: 'Handle file events from external services' })
  @ApiBody({ type: FileEventsDto })
  @ApiResponse({ status: 200, description: 'Event processed successfully' })
  @Post('files')
  handleFileEvent(@Body() dto: FileEventsDto) {
    return this.webhooksService.handleFileEvents(dto);
  }

  @UseGuards(PolarWebhookGuard)
  @ApiOperation({ summary: 'handles webhook events from polar' })
  @ApiResponse({ status: 201, description: 'event handled successfully' })
  @Post('polar')
  async handlePolarEvent(@Req() req: Request) {
    if (!req.polarEvent) {
      this.logger.error({
        message: 'No polar event in request',
      });

      throw new InternalServerErrorException();
    }

    const { type, data, timestamp } = req.polarEvent;

    return this.webhooksService.handlePolarEvent(type, data, timestamp);
  }
}
