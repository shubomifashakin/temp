import {
  Logger,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { S3Service } from '../../../core/s3/s3.service';
import { RedisService } from '../../../core/redis/redis.service';
import { HasherService } from '../../../core/hasher/hasher.service';
import { DatabaseService } from '../../../core/database/database.service';
import { LinkDetailsDto } from '../dtos/link-details.dto';
import { GetLinkFileDto } from '../dtos/get-link-file.dto';
import { makePresignedUrlCacheKey } from '../common/utils';
import { AppConfigService } from '../../../core/app-config/app-config.service';
import { GetLinkFileResponse } from '././dtos/get-link-file-response.dto';

@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly redisService: RedisService,
    private readonly configService: AppConfigService,
    private readonly hasherService: HasherService,
    private readonly databaseService: DatabaseService,
  ) {}

  async getLinkDetails(shareId: string): Promise<LinkDetailsDto> {
    const link = await this.databaseService.link.findUniqueOrThrow({
      where: {
        shareId,
        revokedAt: null,
      },
      select: {
        password: true,
        expiresAt: true,
        createdAt: true,
        clickCount: true,
        description: true,
        lastAccessedAt: true,
        file: {
          select: {
            name: true,
            status: true,
            deletedAt: true,
            description: true,
            contentType: true,
            expiresAt: true,
            size: true,
            createdAt: true,
            user: {
              select: { name: true, picture: true },
            },
          },
        },
      },
    });

    return {
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      description: link.description,
      clickCount: link.clickCount,
      lastAccessedAt: link.lastAccessedAt,
      passwordProtected: link.password !== null,

      fileName: link.file.name,
      fileCreator: link.file.user.name,
      fileStatus: link.file.status,
      fileUploadedAt: link.file.createdAt,
      fileSize: link.file.size,
      fileDescription: link.file.description,
      fileCreatorPicture: link.file.user.picture,
      fileDeleted: link.file.deletedAt !== null,
      fileContentType: link.file.contentType,
      fileExpired: new Date() > link.file.expiresAt,
    };
  }

  async getLinkFile(
    shareId: string,
    dto: GetLinkFileDto,
  ): Promise<GetLinkFileResponse> {
    const linkFound = await this.databaseService.link.findUniqueOrThrow({
      where: {
        shareId,
        revokedAt: null,
      },
      include: {
        file: {
          select: {
            s3Key: true,
            deletedAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (linkFound.expiresAt && new Date() > linkFound.expiresAt) {
      throw new BadRequestException('This link has expired');
    }

    if (linkFound.revokedAt) {
      throw new BadRequestException('This link has been revoked');
    }

    if (
      linkFound.file.deletedAt ||
      (linkFound.file.expiresAt && new Date() > linkFound.file.expiresAt)
    ) {
      throw new BadRequestException('This file no longer exists');
    }

    if (linkFound.password) {
      if (!dto.password) {
        throw new UnauthorizedException('Please enter the password');
      }

      const { success, error, data } = await this.hasherService.verifyPassword(
        dto.password,
        linkFound.password,
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
      await this.databaseService.link.update({
        where: { shareId },
        data: {
          lastAccessedAt: new Date(),
          clickCount: { increment: 1 },
        },
      });

      return { url: existingUrlForFile.data };
    }

    const ttl = this.configService.LinksPresignedGetUrlTtlSeconds.data;
    if (!ttl) {
      this.logger.error({
        message: 'Failed to get links presigned get url ttl seconds',
      });

      throw new InternalServerErrorException();
    }

    const { success, data, error } = this.s3Service.generateCloudFrontSignedUrl(
      {
        key: linkFound.file.s3Key,
        ttl,
      },
    );

    if (!success || !data) {
      this.logger.error({
        error,
        message: 'Failed to generate cloudfront signed url',
      });

      throw new InternalServerErrorException();
    }

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

    await this.databaseService.link.update({
      where: {
        shareId,
      },
      data: {
        lastAccessedAt: new Date(),
        clickCount: { increment: 1 },
      },
    });

    return {
      url: data,
    };
  }
}
