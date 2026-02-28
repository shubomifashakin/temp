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

      const isOld = await this.databaseService.file.findFirst({
        where: {
          s3Key: validatedData.key,
        },
        select: { lastEventAt: true },
      });

      if (!isOld) {
        this.logger.warn({
          message: 'Ignoring file validation event for non-existent file',
          data: dto,
        });

        return { message: 'success' };
      }

      if (isOld?.lastEventAt && isOld.lastEventAt > new Date(dto.timestamp)) {
        this.logger.warn({
          message: 'Ignoring old file validation event',
          data: dto,
        });

        return { message: 'success' };
      }

      const data = await this.databaseService.file.update({
        where: {
          s3Key: validatedData.key,
        },
        data: {
          status: validatedData.infected ? 'unsafe' : 'safe',
          lastEventAt: new Date(dto.timestamp),
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

      const oldFiles = await this.databaseService.file.findMany({
        where: {
          s3Key: { in: deletedData.keys },
        },
        select: { lastEventAt: true, s3Key: true },
      });

      const keysToUpdate = deletedData.keys.filter((key) => {
        const file = oldFiles.find((f) => f.s3Key === key);
        return (
          !file?.lastEventAt || file.lastEventAt <= new Date(dto.timestamp)
        );
      });

      if (!keysToUpdate.length) return { message: 'success' };

      await this.databaseService.file.updateMany({
        where: {
          s3Key: { in: keysToUpdate },
        },
        data: {
          deletedAt: deletedData.deletedAt,
          lastEventAt: new Date(dto.timestamp),
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
