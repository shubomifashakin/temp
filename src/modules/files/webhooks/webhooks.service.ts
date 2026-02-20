import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import {
  FileEventsDto,
  FileDeletedEventPayload,
  FileValidatedEventPayload,
} from './common/dtos/file-events.dto';

import { makeFileCacheKey } from '../common/utils';

import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class WebhooksService {
  logger = new Logger(WebhooksService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  async handleFileEvents(dto: FileEventsDto) {
    if (dto.type === 'file:validated') {
      const validatedData = dto.data as FileValidatedEventPayload;

      const data = await this.databaseService.file.update({
        where: {
          s3Key: validatedData.key,
        },
        data: {
          status: validatedData.infected ? 'unsafe' : 'safe',
        },
      });

      const cached = await this.redisService.delete(makeFileCacheKey(data.id));

      if (!cached.success) {
        this.logger.error({
          message: 'Failed to delete file from cache',
          error: cached.error,
        });
      }

      return { message: 'success' };
    }

    if (dto.type === 'file:deleted') {
      const deletedData = dto.data as FileDeletedEventPayload;

      await this.databaseService.file.updateMany({
        where: {
          s3Key: { in: deletedData.keys },
        },
        data: {
          deletedAt: deletedData.deletedAt,
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
