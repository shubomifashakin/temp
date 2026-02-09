import { Injectable, Logger } from '@nestjs/common';

import { makeFileCacheKey } from './common/utils';
import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UpdateFileDto } from './dtos/update-file.dto';

import { MINUTES_10 } from '../../common/constants';
import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class FilesService {
  logger = new Logger(FilesService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ) {
    console.log('the data', dto);

    //FIXME: UPLOAD THE FILE TO S3

    await this.databaseService.files.create({
      data: {
        description: dto.description,
        s3_key: '', //FIXME:
        user_id: userId,
      },
    });
  }

  async getFiles(userId: string) {}

  async getSingleFile(userId: string, fileId: string): Promise<GetFileDto> {
    const cached = await this.redisService.get<GetFileDto>(
      makeFileCacheKey(fileId),
    );

    if (cached.error) {
      this.logger.error({
        message: 'Failed to get file metadata from cache',
        error: cached.error,
      });
    }

    if (cached.success && cached.data) {
      return cached.data;
    }

    const file = await this.databaseService.files.findUniqueOrThrow({
      where: {
        id: fileId,
        user_id: userId,
      },
      select: {
        id: true,
        status: true,
        user_id: true,
        deleted_at: true,
        description: true,
        view_count: true,
        created_at: true,
        updated_at: true,
        last_accesed_at: true,
      },
    });

    const { success, error } = await this.redisService.set(
      makeFileCacheKey(fileId),
      file,
      { expiration: { type: 'EX', value: MINUTES_10 } },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to store file metadata in cache',
        error,
      });
    }

    return file;
  }

  async deleteSingleFile(userId: string, fileId: string) {
    //FIXME: push the payload to sqs

    await this.databaseService.files.delete({
      where: {
        id: fileId,
        user_id: userId,
      },
    });

    const { success, error } = await this.redisService.delete(
      makeFileCacheKey(fileId),
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to delete file from cache',
        error,
      });
    }

    return { message: 'success' };
  }

  async updateSingleFile(userId: string, fileId: string, dto: UpdateFileDto) {
    const file = await this.databaseService.files.update({
      where: {
        id: fileId,
        user_id: userId,
      },
      data: {
        description: dto.description,
      },
      select: {
        id: true,
        status: true,
        user_id: true,
        deleted_at: true,
        description: true,
        view_count: true,
        created_at: true,
        updated_at: true,
        last_accesed_at: true,
      },
    });

    const { success, error } = await this.redisService.set(
      makeFileCacheKey(fileId),
      file,
      { expiration: { type: 'EX', value: MINUTES_10 } },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to update file metadata in cache',
        error,
      });
    }

    return file;
  }
}
