import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { v4 as uuid } from 'uuid';

import { makeFileCacheKey } from './common/utils';
import { ALLOWED_LIFETIMES } from './common/constants';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UpdateFileDto } from './dtos/update-file.dto';
import { GenerateLinkDto } from './dtos/generate-link.dto';
import { GetSharedFile } from './dtos/get-shared-file.dto';

import { MINUTES_10 } from '../../common/constants';
import { S3Service } from '../../core/s3/s3.service';
import { SqsService } from '../../core/sqs/sqs.service';
import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class FilesService {
  logger = new Logger(FilesService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ) {
    const key = uuid();

    const { success, error } = await this.s3Service.uploadToS3({
      key: key,
      body: file,
      tags: `lifetime=${dto.lifetime}`,
      bucket: this.configService.getOrThrow('S3_BUCKET_NAME'),
    });

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to upload file to s3',
      });

      throw new InternalServerErrorException();
    }

    const response = await this.databaseService.files.create({
      data: {
        s3_key: key,
        user_id: userId,
        size: file.size,
        description: dto.description,
        expires_at: new Date(Date.now() + ALLOWED_LIFETIMES[dto.lifetime]),
      },
    });

    return { id: response.id };
  }

  async getFiles(userId: string, cursor?: string) {
    const limit = 10;

    const files = await this.databaseService.files.findMany({
      where: {
        user_id: userId,
      },
      select: {
        id: true,
        size: true,
        status: true,
        view_count: true,
        expires_at: true,
        description: true,
        last_accesed_at: true,
      },
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
      take: limit + 1,
      orderBy: {
        id: 'asc',
      },
    });

    const hasNextPage = files.length > limit;
    const data = files.slice(0, limit);
    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    return {
      data,
      hasNextPage,
      cursor: nextCursor,
    };
  }

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
        size: true,
        status: true,
        user_id: true,
        deleted_at: true,
        description: true,
        view_count: true,
        created_at: true,
        updated_at: true,
        expires_at: true,
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
    const queued = await this.sqsService.pushMessage({
      message: { userId, fileId },
      queueUrl: this.configService.getOrThrow('SQS_QUEUE_URL'),
    });

    if (!queued.success) {
      this.logger.error({
        error: queued.error,
        message: 'Failed to queue file for deletion',
      });

      throw new InternalServerErrorException();
    }

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

  async updateSingleFile(
    userId: string,
    fileId: string,
    dto: UpdateFileDto,
  ): Promise<GetFileDto> {
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
        size: true,
        status: true,
        user_id: true,
        deleted_at: true,
        description: true,
        view_count: true,
        created_at: true,
        updated_at: true,
        expires_at: true,
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

  async generateShareLink(
    userId: string,
    fileId: string,
    dto: GenerateLinkDto,
  ) {
    const file = await this.databaseService.files.findUniqueOrThrow({
      where: {
        id: fileId,
        user_id: userId,
      },
    });

    if (file.status !== 'safe') {
      throw new BadRequestException('File is not safe');
    }

    if (file.deleted_at) {
      throw new BadRequestException('File has been deleted');
    }

    //FIXME: HASH THE PASSWORD

    const link = await this.databaseService.shareLinks.create({
      data: {
        file_id: fileId,
        password: dto.password,
        expires_at: dto.expiresAt,
        description: dto.description,
      },
    });

    return {
      id: link.id,
    };
  }

  async revokeShareLink(userId: string, fileId: string, shareId: string) {
    await this.databaseService.files.findUniqueOrThrow({
      where: {
        id: fileId,
        user_id: userId,
      },
    });

    await this.databaseService.shareLinks.update({
      where: {
        id: shareId,
        file_id: fileId,
      },
      data: {
        revoked_at: new Date(),
      },
    });

    return {
      message: 'success',
    };
  }

  async getSharedFile(fileId: string, shareId: string, dto: GetSharedFile) {
    const fileFound = await this.databaseService.shareLinks.findUniqueOrThrow({
      where: {
        id: shareId,
        file_id: fileId,
        revoked_at: null,
      },
      include: {
        file: {
          select: {
            s3_key: true,
          },
        },
      },
    });

    if (fileFound.expires_at && new Date() > fileFound.expires_at) {
      throw new BadRequestException('This link has expired');
    }

    if (fileFound.password) {
      if (!dto.password) {
        throw new UnauthorizedException('Please enter the password');
      }

      //FIXME: COMPARE THE PASSWORD SENT WITH THE HASH, IF NOT THE SAME THROW UNAUTHORIZED
    }

    const { success, data, error } =
      await this.s3Service.generatePresignedGetUrl({
        ttl: 3600 / 2,
        key: fileFound.file.s3_key,
        bucket: this.configService.getOrThrow('S3_BUCKET_NAME'),
      });

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to generate presigned get url',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.shareLinks.update({
      where: {
        id: shareId,
        file_id: fileId,
      },
      data: {
        last_accessed_at: new Date(),
        click_count: { increment: 1 },
        file: {
          update: {
            last_accesed_at: new Date(),
            view_count: { increment: 1 },
          },
        },
      },
    });

    return {
      s3Link: data,
    };
  }
}
