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

  async getLinkDetails(linkId: string): Promise<LinkDetailsDto> {
    const link = await this.databaseService.link.findUniqueOrThrow({
      where: {
        id: linkId,
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

  async getLinkFile(linkId: string, dto: GetLinkFileDto) {
    const linkFound = await this.databaseService.link.findUniqueOrThrow({
      where: {
        id: linkId,
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

    if (linkFound.expires_at && new Date() > linkFound.expires_at) {
      throw new BadRequestException('This link has expired');
    }

    if (linkFound.revoked_at) {
      throw new BadRequestException('This link has been revoked');
    }

    if (
      linkFound.file.deleted_at ||
      (linkFound.file.expires_at && new Date() > linkFound.file.expires_at)
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

    const urlCacheKey = makePresignedUrlCacheKey(linkId);

    const existingUrlForFile = await this.redisService.get<string>(urlCacheKey);

    if (!existingUrlForFile.success) {
      this.logger.error({
        error: existingUrlForFile.error,
        message: 'Failed to get cached url for file',
      });
    }

    if (existingUrlForFile.success && existingUrlForFile.data) {
      await this.databaseService.link.update({
        where: { id: linkId },
        data: {
          last_accessed_at: new Date(),
          click_count: { increment: 1 },
        },
      });

      return { fileUrl: existingUrlForFile.data };
    }

    const ttl = 3600 / 2;
    const { success, data, error } =
      await this.s3Service.generatePresignedGetUrl({
        ttl,
        key: linkFound.file.s3_key,
        bucket: this.configService.S3BucketName.data!,
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

    await this.databaseService.link.update({
      where: {
        id: linkId,
      },
      data: {
        last_accessed_at: new Date(),
        click_count: { increment: 1 },
      },
    });

    return {
      fileUrl: data,
    };
  }
}
