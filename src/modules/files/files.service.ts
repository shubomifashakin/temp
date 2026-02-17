import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { v4 as uuid } from 'uuid';
import { Counter } from 'prom-client';

import { ALLOWED_LIFETIMES } from './common/constants';
import { makeFileCacheKey, makePresignedUrlCacheKey } from './common/utils';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UpdateFileDto } from './dtos/update-file.dto';
import { CreateLinkDto } from './dtos/create-link.dto';
import { UpdateLinkDto } from './dtos/update-link.dto';
import { GetFilesResponseDto } from './dtos/get-files-response.dto';
import { CreateLinkResponseDto } from './dtos/create-link-response.dto';
import { GetFileLinksResponseDto } from './dtos/get-file-links-response.dto';

import { MINUTES_10 } from '../../common/constants';
import { S3Service } from '../../core/s3/s3.service';
import { SqsService } from '../../core/sqs/sqs.service';
import { RedisService } from '../../core/redis/redis.service';
import { HasherService } from '../../core/hasher/hasher.service';
import { DatabaseService } from '../../core/database/database.service';
import { PrometheusService } from '../../core/prometheus/prometheus.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  private readonly filesUploaderCounter: Counter;
  private readonly linksCreatedCounter: Counter;

  constructor(
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly hasherService: HasherService,
    private readonly databaseService: DatabaseService,
    private readonly prometheusService: PrometheusService,
  ) {
    this.filesUploaderCounter = this.prometheusService.createCounter(
      'files_uploaded_total',
      'Total number of files uploaded',
      ['lifetime', 'size'],
    );

    this.linksCreatedCounter = this.prometheusService.createCounter(
      'links_created_total',
      'Total number of links created',
    );
  }

  async uploadFile(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ) {
    const key = uuid();

    const fileWithNameeExist = await this.databaseService.file.findUnique({
      where: {
        files_name_unique: {
          user_id: userId,
          name: dto.name,
        },
      },
    });

    if (fileWithNameeExist) {
      throw new BadRequestException('You already have a file with this name');
    }

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

    const response = await this.databaseService.file.create({
      data: {
        s3_key: key,
        name: dto.name,
        user_id: userId,
        size: file.size,
        description: dto.description,
        expires_at: new Date(Date.now() + ALLOWED_LIFETIMES[dto.lifetime]),
      },
    });

    this.filesUploaderCounter.inc(
      { lifetime: dto.lifetime, size: file.size.toString() },
      1,
    );

    return { id: response.id };
  }

  async getFiles(
    userId: string,
    cursor?: string,
  ): Promise<GetFilesResponseDto> {
    const limit = 10;

    const files = await this.databaseService.file.findMany({
      where: {
        user_id: userId,
      },
      select: {
        id: true,
        size: true,
        status: true,
        expires_at: true,
        description: true,
        name: true,
      },
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
      take: limit + 1,
      orderBy: {
        created_at: 'desc',
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

    const file = await this.databaseService.file.findUniqueOrThrow({
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
        created_at: true,
        updated_at: true,
        expires_at: true,
        name: true,
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
    const s3Key = await this.databaseService.file.findUniqueOrThrow({
      where: {
        id: fileId,
        user_id: userId,
      },
      select: {
        s3_key: true,
        deleted_at: true,
      },
    });

    if (s3Key.deleted_at) {
      return { message: 'success' };
    }

    const queued = await this.sqsService.pushMessage({
      message: { s3Key: s3Key.s3_key },
      queueUrl: this.configService.getOrThrow('SQS_QUEUE_URL'),
    });

    if (!queued.success) {
      this.logger.error({
        error: queued.error,
        message: 'Failed to queue file for deletion',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.file.update({
      where: {
        id: fileId,
        user_id: userId,
      },
      data: {
        deleted_at: new Date(),
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
    const file = await this.databaseService.file.update({
      where: {
        id: fileId,
        user_id: userId,
      },
      data: {
        description: dto.description,
        name: dto.name,
      },
      select: {
        id: true,
        size: true,
        name: true,
        status: true,
        user_id: true,
        deleted_at: true,
        description: true,
        created_at: true,
        updated_at: true,
        expires_at: true,
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

  async createLink(
    userId: string,
    fileId: string,
    dto: CreateLinkDto,
  ): Promise<CreateLinkResponseDto> {
    const file = await this.databaseService.file.findUniqueOrThrow({
      where: {
        id: fileId,
        user_id: userId,
      },
    });

    if (file.status !== 'safe') {
      throw new BadRequestException('File is not safe');
    }

    if (file.deleted_at) {
      throw new NotFoundException('File has been deleted');
    }

    if (new Date() > file.expires_at) {
      throw new NotFoundException('File has expired');
    }

    let password = dto.password;

    if (dto.password) {
      const { success, data, error } = await this.hasherService.hashPassword(
        dto.password,
      );

      if (!success) {
        this.logger.error({
          error,
          message: 'Failed to hash link password',
        });

        throw new InternalServerErrorException();
      }

      password = data;
    }

    const link = await this.databaseService.link.create({
      data: {
        password,
        file_id: fileId,
        expires_at: dto.expiresAt,
        description: dto.description,
      },
    });

    this.linksCreatedCounter.inc(1);

    return {
      id: link.id,
    };
  }

  async getFileLinks(
    userId: string,
    fileId: string,
    cursor?: string,
  ): Promise<GetFileLinksResponseDto> {
    const limit = 10;

    const files = await this.databaseService.link.findMany({
      where: {
        file_id: fileId,
        file: {
          user_id: userId,
        },
      },
      select: {
        id: true,
        password: true,
        revoked_at: true,
        created_at: true,
        click_count: true,
        expires_at: true,
        description: true,
        last_accessed_at: true,
      },
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
      take: limit + 1,
      orderBy: {
        created_at: 'desc',
      },
    });

    const hasNextPage = files.length > limit;
    const data = files.slice(0, limit).map((file) => {
      const { password, ...safeFile } = file;
      return {
        ...safeFile,
        password_protected: password !== null,
      };
    });
    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    return {
      data,
      hasNextPage,
      cursor: nextCursor,
    };
  }

  async revokeLink(userId: string, fileId: string, linkId: string) {
    const linkDetails = await this.databaseService.link.findUniqueOrThrow({
      where: {
        id: linkId,
        file_id: fileId,
        file: {
          user_id: userId,
        },
      },
    });

    if (linkDetails.revoked_at) {
      return { message: 'success' };
    }

    await this.databaseService.link.update({
      where: {
        id: linkId,
        file_id: fileId,
        file: {
          user_id: userId,
        },
      },
      data: {
        revoked_at: new Date(),
      },
    });

    const { success, error } = await this.redisService.delete(
      makePresignedUrlCacheKey(linkId),
    );

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to delete link presigned url from cache',
      });
    }

    return {
      message: 'success',
    };
  }

  async updateLink(
    userId: string,
    fileId: string,
    linkId: string,
    dto: UpdateLinkDto,
  ) {
    let password: string | undefined = undefined;

    if (dto.password) {
      const hashed = await this.hasherService.hashPassword(dto.password);

      if (!hashed.success) {
        this.logger.error({
          error: hashed.error,
          message: 'Failed to hash link password',
        });

        throw new InternalServerErrorException();
      }

      password = hashed.data;
    }

    await this.databaseService.link.update({
      where: {
        id: linkId,
        file_id: fileId,
        file: {
          user_id: userId,
        },
      },
      data: {
        password,
        description: dto.description,
        expires_at: dto.expiresAt,
      },
    });
  }
}
