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
import { AppConfigService } from '../../core/app-config/app-config.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  private readonly filesUploaderCounter: Counter;
  private readonly linksCreatedCounter: Counter;

  constructor(
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly redisService: RedisService,
    private readonly configService: AppConfigService,
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
          userId: userId,
          name: dto.name,
        },
      },
    });

    if (fileWithNameeExist) {
      throw new BadRequestException('You already have a file with this name');
    }

    const s3Bucket = this.configService.S3BucketName;
    if (!s3Bucket.success) {
      this.logger.error({
        error: s3Bucket.error,
        message: 'S3 bucket name not set in env',
      });

      throw new InternalServerErrorException();
    }

    const { success, error } = await this.s3Service.uploadToS3({
      key: key,
      body: file,
      tags: `lifetime=${dto.lifetime}`,
      bucket: s3Bucket.data,
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
        s3Key: key,
        name: dto.name,
        userId: userId,
        size: file.size,
        contentType: file.mimetype,
        description: dto.description,
        expiresAt: new Date(Date.now() + ALLOWED_LIFETIMES[dto.lifetime]),
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
        userId: userId,
      },
      select: {
        id: true,
        size: true,
        status: true,
        expiresAt: true,
        contentType: true,
        description: true,
        name: true,
        _count: {
          select: {
            links: true,
          },
        },
        links: {
          select: {
            clickCount: true,
          },
        },
      },
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
      take: limit + 1,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasNextPage = files.length > limit;
    const rawFiles = files.slice(0, limit);

    const data = rawFiles.map((file) => ({
      id: file.id,
      size: file.size,
      status: file.status,
      expiresAt: file.expiresAt,
      contentType: file.contentType,
      description: file.description,
      name: file.name,
      totalLinks: file._count.links,
      totalClicks: file.links.reduce((sum, link) => sum + link.clickCount, 0),
    }));

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
        userId: userId,
      },
      select: {
        id: true,
        size: true,
        status: true,
        userId: true,
        deletedAt: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        contentType: true,
        expiresAt: true,
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
        userId: userId,
      },
      select: {
        s3Key: true,
        deletedAt: true,
      },
    });

    if (s3Key.deletedAt) {
      return { message: 'success' };
    }

    const queued = await this.sqsService.pushMessage({
      message: { s3Key: s3Key.s3Key },
      queueUrl: this.configService.SqsQueueUrl.data!,
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
        userId: userId,
      },
      data: {
        deletedAt: new Date(),
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
        userId: userId,
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
        userId: true,
        deletedAt: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        contentType: true,
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
        userId: userId,
      },
    });

    if (file.status !== 'safe') {
      throw new BadRequestException('File is not safe');
    }

    if (file.deletedAt) {
      throw new NotFoundException('File has been deleted');
    }

    if (new Date() > file.expiresAt) {
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
        fileId: fileId,
        expiresAt: dto.expiresAt,
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
        fileId: fileId,
        file: {
          userId: userId,
        },
      },
      select: {
        id: true,
        password: true,
        revokedAt: true,
        createdAt: true,
        clickCount: true,
        expiresAt: true,
        description: true,
        lastAccessedAt: true,
      },
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1,
      }),
      take: limit + 1,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasNextPage = files.length > limit;
    const data = files.slice(0, limit).map((file) => {
      const { password, ...safeFile } = file;
      return {
        ...safeFile,
        passwordProtected: password !== null,
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
        fileId: fileId,
        file: {
          userId: userId,
        },
      },
    });

    if (linkDetails.revokedAt) {
      return { message: 'success' };
    }

    await this.databaseService.link.update({
      where: {
        id: linkId,
        fileId: fileId,
        file: {
          userId: userId,
        },
      },
      data: {
        revokedAt: new Date(),
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
        fileId: fileId,
        file: {
          userId: userId,
        },
      },
      data: {
        password,
        description: dto.description,
        expiresAt: dto.expiresAt,
      },
    });

    return {
      message: 'success',
    };
  }
}
