import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { v4 as uuid } from 'uuid';

import { ALLOWED_LIFETIMES } from './common/constants';
import { makeFileCacheKey, makePresignedUrlCacheKey } from './common/utils';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UpdateFileDto } from './dtos/update-file.dto';
import { GenerateLinkDto } from './dtos/generate-link.dto';
import { GetSharedFile } from './dtos/get-shared-file.dto';
import { ShareLinkDetailsDto } from './dtos/share-link-details.dto';
import { GetFilesResponseDto } from './dtos/get-files-response.dto';
import { GenerateShareIdResponseDto } from './dtos/generate-share-id.dto';
import { GetFileShareLinksResponseDto } from './dtos/get-file-share-links-response.dto';

import { MINUTES_10 } from '../../common/constants';
import { S3Service } from '../../core/s3/s3.service';
import { SqsService } from '../../core/sqs/sqs.service';
import { RedisService } from '../../core/redis/redis.service';
import { HasherService } from '../../core/hasher/hasher.service';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class FilesService {
  logger = new Logger(FilesService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly hasherService: HasherService,
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

  async getFiles(
    userId: string,
    cursor?: string,
  ): Promise<GetFilesResponseDto> {
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

    await this.databaseService.files.update({
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

  async generateShareId(
    userId: string,
    fileId: string,
    dto: GenerateLinkDto,
  ): Promise<GenerateShareIdResponseDto> {
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

    const link = await this.databaseService.shareLinks.create({
      data: {
        password,
        file_id: fileId,
        expires_at: dto.expiresAt,
        description: dto.description,
      },
    });

    return {
      id: link.id,
    };
  }

  async getFileShareLinks(
    userId: string,
    fileId: string,
    cursor?: string,
  ): Promise<GetFileShareLinksResponseDto> {
    const limit = 10;

    const files = await this.databaseService.shareLinks.findMany({
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

  async revokeShareLink(userId: string, fileId: string, shareId: string) {
    await this.databaseService.shareLinks.update({
      where: {
        id: shareId,
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
      makePresignedUrlCacheKey(shareId),
    );

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to delete share link presigned url from cache',
      });
    }

    return {
      message: 'success',
    };
  }

  async getShareLinkDetails(shareId: string): Promise<ShareLinkDetailsDto> {
    const link = await this.databaseService.shareLinks.findUniqueOrThrow({
      where: {
        id: shareId,
        revoked_at: null,
      },
      select: {
        password: true,
        expires_at: true,
        created_at: true,
        click_count: true,
        description: true,
        last_accessed_at: true,
        file: {
          select: {
            status: true,
            deleted_at: true,
            description: true,
            user: {
              select: { name: true },
            },
          },
        },
      },
    });

    return {
      created_at: link.created_at,
      expires_at: link.expires_at,
      description: link.description,
      click_count: link.click_count,
      last_accessed_at: link.last_accessed_at,
      password_protected: link.password !== null,

      file_creator: link.file.user.name,
      file_status: link.file.status,
      file_description: link.file.description,
      file_deleted: link.file.deleted_at !== null,
    };
  }

  async getSharedFile(shareId: string, dto: GetSharedFile) {
    const fileFound = await this.databaseService.shareLinks.findUniqueOrThrow({
      where: {
        id: shareId,
        revoked_at: null,
      },
      include: {
        file: {
          select: {
            s3_key: true,
            deleted_at: true,
            expires_at: true,
          },
        },
      },
    });

    if (fileFound.expires_at && new Date() > fileFound.expires_at) {
      throw new BadRequestException('This link has expired');
    }

    if (
      fileFound.file.deleted_at ||
      (fileFound.file.expires_at && new Date() > fileFound.file.expires_at)
    ) {
      throw new BadRequestException('This file no longer exists');
    }

    if (fileFound.password) {
      if (!dto.password) {
        throw new UnauthorizedException('Please enter the password');
      }

      const { success, error, data } = await this.hasherService.verifyPassword(
        dto.password,
        fileFound.password,
      );

      if (!success) {
        this.logger.error({
          error,
          message: 'Failed to verify link password',
        });

        throw new InternalServerErrorException();
      }

      if (!data) {
        throw new UnauthorizedException('Incorrect password');
      }
    }

    const urlCacheKey = makePresignedUrlCacheKey(shareId);

    const existingUrlForFile = await this.redisService.get<string>(urlCacheKey);

    if (!existingUrlForFile.success) {
      this.logger.error({
        error: existingUrlForFile.error,
        message: 'Failed to get cached url for file',
      });
    }

    if (existingUrlForFile.success && existingUrlForFile.data) {
      await this.databaseService.shareLinks.update({
        where: { id: shareId },
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

      return { fileUrl: existingUrlForFile.data };
    }

    const ttl = 3600 / 2;
    const { success, data, error } =
      await this.s3Service.generatePresignedGetUrl({
        ttl,
        key: fileFound.file.s3_key,
        bucket: this.configService.getOrThrow('S3_BUCKET_NAME'),
      });

    const { success: cacheSuccess, error: cacheError } =
      await this.redisService.set(urlCacheKey, data, {
        expiration: { type: 'EX', value: ttl },
      });

    if (!cacheSuccess) {
      this.logger.error({
        error: cacheError,
        message: 'Failed to cache url for file',
      });
    }

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
      fileUrl: data,
    };
  }
}
