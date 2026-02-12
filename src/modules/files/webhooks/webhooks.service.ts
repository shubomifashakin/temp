import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import {
  FileEventsDto,
  FileDeletedEventPayload,
  FileValidatedEventPayload,
} from './common/file-events.dto';

import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class WebhooksService {
  logger = new Logger(WebhooksService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async handleFileEvents(dto: FileEventsDto) {
    if (dto.type === 'file:validated') {
      const validatedData = dto.data as FileValidatedEventPayload;

      await this.databaseService.files.updateMany({
        where: {
          s3_key: validatedData.fileName,
        },
        data: {
          status: validatedData.safe ? 'safe' : 'unsafe',
        },
      });

      return { message: 'success' };
    }

    if (dto.type === 'file:deleted') {
      const deletedData = dto.data as FileDeletedEventPayload;

      await this.databaseService.files.updateMany({
        where: {
          s3_key: { in: deletedData.keys },
        },
        data: {
          deleted_at: deletedData.deleted_at,
        },
      });

      return { message: 'success' };
    }

    this.logger.warn({
      data: dto,
      message: 'Invalid file event received',
    });

    throw new BadRequestException('Invalid file event');
  }
}
