import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { v4 as uuid } from 'uuid';
import { Counter, Histogram } from 'prom-client';

import {
  ALLOWED_LIFETIMES_MS,
  MULTIPART_THRESHOLD_BYTES,
} from './common/constants';
import { makeFileCacheKey, makePresignedUrlCacheKey } from './common/utils';

import { GetFileDto } from './dtos/get-file.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { UpdateFileDto } from './dtos/update-file.dto';
import { CreateLinkDto } from './dtos/create-link.dto';
import { UpdateLinkDto } from './dtos/update-link.dto';
import { GetFilesResponseDto } from './dtos/get-files-response.dto';
import { CreateLinkResponseDto } from './dtos/create-link-response.dto';
import { GetFileLinksResponseDto } from './dtos/get-file-links-response.dto';
import {
  UploadResponseType,
  PresignedPostResponseDto,
  MultipartInitiatedResponseDto,
} from './dtos/upload-file-response.dto';

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
  private readonly fileSizeHistogram: Histogram;

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
      ['lifetime'],
    );

    this.fileSizeHistogram = this.prometheusService.createHistogram(
      'file_size_bytes',
      'Size of files uploaded',
      ['lifetime'],
      [1024, 1024 * 1024, 1024 * 1024 * 1024],
    );

    this.linksCreatedCounter = this.prometheusService.createCounter(
      'links_created_total',
      'Total number of links created',
    );
  }

  async generateUploadUrl(
    dto: UploadFileDto,
    userId: string,
  ): Promise<PresignedPostResponseDto | MultipartInitiatedResponseDto> {
    if (dto.fileSizeBytes > MULTIPART_THRESHOLD_BYTES) {
      return this.initiateMultipartUpload(dto, userId);
    }

    return this.generatePresignedPost(dto, userId);
  }

  private async generatePresignedPost(
    dto: UploadFileDto,
    userId: string,
  ): Promise<PresignedPostResponseDto> {
    let key = `uploads/${userId}/${uuid()}`;

    const fileWithNameExist = await this.databaseService.file.findUnique({
      where: {
        files_name_content_type_unique: {
          userId: userId,
          name: dto.name,
          contentType: dto.contentType,
        },
      },
    });

    if (fileWithNameExist && fileWithNameExist.status !== 'pending') {
      throw new BadRequestException('You already have a file with this name');
    }

    if (fileWithNameExist) {
      key = fileWithNameExist.s3Key;
    }

    const s3Bucket = this.configService.S3BucketName;
    if (!s3Bucket.success) {
      this.logger.error({
        error: s3Bucket.error,
        message: 'S3 bucket name not set in env',
      });

      throw new InternalServerErrorException();
    }

    const uploadTtl = this.configService.UploadPresignedPostUrlTtlSeconds.data;
    if (!uploadTtl) {
      this.logger.error({
        message: 'Upload presigned post url ttl not set in env',
      });

      throw new InternalServerErrorException();
    }

    const { success, error, data } =
      await this.s3Service.generatePresignedPostUrl({
        key: key,
        ttl: uploadTtl,
        bucket: s3Bucket.data,
        contentType: dto.contentType,
        tag: dto.lifetime,
        contentLength: dto.fileSizeBytes,
      });

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to generate presigned url for upload',
      });

      throw new InternalServerErrorException();
    }

    if (!fileWithNameExist) {
      await this.databaseService.file.create({
        data: {
          s3Key: key,
          name: dto.name,
          userId: userId,
          size: BigInt(dto.fileSizeBytes),
          contentType: dto.contentType,
          description: dto.description,
          expiresAt: new Date(Date.now() + ALLOWED_LIFETIMES_MS[dto.lifetime]),
        },
      });

      this.filesUploaderCounter.inc({ lifetime: dto.lifetime }, 1);
      this.fileSizeHistogram.observe(
        { lifetime: dto.lifetime },
        dto.fileSizeBytes,
      );
    }

    return { type: UploadResponseType.PresignedPost, ...data };
  }

  private async initiateMultipartUpload(
    dto: UploadFileDto,
    userId: string,
  ): Promise<MultipartInitiatedResponseDto> {
    const fileWithNameExist = await this.databaseService.file.findUnique({
      where: {
        files_name_content_type_unique: {
          userId: userId,
          name: dto.name,
          contentType: dto.contentType,
        },
      },
    });

    if (fileWithNameExist && fileWithNameExist.status !== 'pending') {
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

    const uploadTtl =
      this.configService.UploadPresignedPostUrlTtlSeconds.data ?? 1800;
    const key = fileWithNameExist?.s3Key ?? `uploads/${userId}/${uuid()}`;

    const {
      success,
      error,
      data: uploadId,
    } = await this.s3Service.createMultipartUpload({
      key,
      bucket: s3Bucket.data,
      contentType: dto.contentType,
      tag: dto.lifetime,
      ttl: uploadTtl,
    });

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to create multipart upload',
      });

      throw new InternalServerErrorException();
    }

    let fileId: string;

    if (fileWithNameExist) {
      await this.databaseService.file.update({
        where: { id: fileWithNameExist.id },
        data: { multipartUploadId: uploadId },
      });

      fileId = fileWithNameExist.id;
    } else {
      const file = await this.databaseService.file.create({
        data: {
          s3Key: key,
          name: dto.name,
          userId: userId,
          size: BigInt(dto.fileSizeBytes),
          contentType: dto.contentType,
          description: dto.description,
          multipartUploadId: uploadId,
          expiresAt: new Date(Date.now() + ALLOWED_LIFETIMES_MS[dto.lifetime]),
        },
      });

      fileId = file.id;
    }

    return { type: UploadResponseType.Multipart, fileId, key, uploadId };
  }

  async signMultipartPart(
    userId: string,
    fileId: string,
    partNumber: number,
  ): Promise<{ url: string }> {
    const file = await this.databaseService.file.findUnique({
      where: { id: fileId, userId },
      select: { s3Key: true, multipartUploadId: true, status: true },
    });

    if (!file || !file.multipartUploadId) {
      throw new NotFoundException('Multipart upload not found');
    }

    if (file.status !== 'pending') {
      throw new BadRequestException('File is not in a pending state');
    }

    const s3Bucket = this.configService.S3BucketName;
    if (!s3Bucket.success) {
      throw new InternalServerErrorException();
    }

    const {
      success,
      error,
      data: url,
    } = await this.s3Service.signUploadPart({
      key: file.s3Key,
      bucket: s3Bucket.data,
      uploadId: file.multipartUploadId,
      partNumber,
    });

    if (!success) {
      this.logger.error({ error, message: 'Failed to sign upload part' });
      throw new InternalServerErrorException();
    }

    return { url };
  }

  async completeMultipartUpload(
    userId: string,
    fileId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<{ message: string }> {
    const file = await this.databaseService.file.findUnique({
      where: { id: fileId, userId },
      select: { s3Key: true, multipartUploadId: true, status: true },
    });

    if (!file || !file.multipartUploadId) {
      throw new NotFoundException('Multipart upload not found');
    }

    if (file.status !== 'pending') {
      throw new BadRequestException('File is not in a pending state');
    }

    const s3Bucket = this.configService.S3BucketName;
    if (!s3Bucket.success) {
      throw new InternalServerErrorException();
    }

    const { success, error } = await this.s3Service.completeMultipartUpload({
      key: file.s3Key,
      bucket: s3Bucket.data,
      uploadId: file.multipartUploadId,
      parts,
    });

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to complete multipart upload',
      });
      throw new InternalServerErrorException();
    }

    await this.databaseService.file.update({
      where: { id: fileId },
      data: { multipartUploadId: null, status: 'unscanned' },
    });

    return { message: 'success' };
  }

  async abortMultipartUpload(
    userId: string,
    fileId: string,
  ): Promise<{ message: string }> {
    const file = await this.databaseService.file.findUnique({
      where: { id: fileId, userId },
      select: { s3Key: true, multipartUploadId: true },
    });

    if (!file || !file.multipartUploadId) {
      throw new NotFoundException('Multipart upload not found');
    }

    const s3Bucket = this.configService.S3BucketName;
    if (!s3Bucket.success) {
      throw new InternalServerErrorException();
    }

    const { success, error } = await this.s3Service.abortMultipartUpload({
      key: file.s3Key,
      bucket: s3Bucket.data,
      uploadId: file.multipartUploadId,
    });

    if (!success) {
      this.logger.error({ error, message: 'Failed to abort multipart upload' });
      throw new InternalServerErrorException();
    }

    await this.databaseService.file.delete({ where: { id: fileId } });

    return { message: 'success' };
  }

  async getFiles(
    userId: string,
    cursor?: string,
  ): Promise<GetFilesResponseDto> {
    const limit = 10;

    const files = await this.databaseService.file.findMany({
      where: { userId },
      select: {
        id: true,
        size: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        contentType: true,
        description: true,
        name: true,
        _count: { select: { links: true } },
        links: { select: { clickCount: true } },
      },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = files.length > limit;
    const rawFiles = files.slice(0, limit);

    const data = rawFiles.map((file) => ({
      id: file.id,
      size: Number(file.size),
      status: file.status,
      expiresAt: file.expiresAt,
      contentType: file.contentType,
      description: file.description,
      createdAt: file.createdAt,
      name: file.name,
      totalLinks: file._count.links,
      totalClicks: file.links.reduce((sum, link) => sum + link.clickCount, 0),
    }));

    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    return { data, hasNextPage, cursor: nextCursor };
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
      where: { id: fileId, userId },
      select: {
        id: true,
        size: true,
        status: true,
        userId: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        contentType: true,
        expiresAt: true,
        name: true,
      },
    });

    const result = { ...file, size: Number(file.size) };

    const { success, error } = await this.redisService.set(
      makeFileCacheKey(fileId),
      result,
      { expiration: { type: 'EX', value: MINUTES_10 } },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to store file metadata in cache',
        error,
      });
    }

    return result;
  }

  async deleteSingleFile(userId: string, fileId: string) {
    const fileExists = await this.databaseService.file.findUniqueOrThrow({
      where: { id: fileId, userId },
      select: { s3Key: true },
    });

    await this.databaseService.$transaction(async (tx) => {
      await tx.file.delete({ where: { id: fileId, userId } });

      const queued = await this.sqsService.pushMessage({
        message: { s3Key: fileExists.s3Key },
        queueUrl: this.configService.FileDeletionQueueUrl.data!,
      });

      if (!queued.success) {
        this.logger.error({
          error: queued.error,
          message: 'Failed to queue file for deletion',
        });

        throw new InternalServerErrorException();
      }
    });

    const { success, error } = await this.redisService.delete(
      makeFileCacheKey(fileId),
    );

    if (!success) {
      this.logger.error({ message: 'Failed to delete file from cache', error });
    }

    return { message: 'success' };
  }

  async updateSingleFile(
    userId: string,
    fileId: string,
    dto: UpdateFileDto,
  ): Promise<GetFileDto> {
    const file = await this.databaseService.file.update({
      where: { id: fileId, userId },
      data: { description: dto.description, name: dto.name },
      select: {
        id: true,
        size: true,
        name: true,
        status: true,
        userId: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        contentType: true,
      },
    });

    const result = { ...file, size: Number(file.size) };

    const { success, error } = await this.redisService.set(
      makeFileCacheKey(fileId),
      result,
      { expiration: { type: 'EX', value: MINUTES_10 } },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to update file metadata in cache',
        error,
      });
    }

    return result;
  }

  async createLink(
    userId: string,
    fileId: string,
    dto: CreateLinkDto,
  ): Promise<CreateLinkResponseDto> {
    const file = await this.databaseService.file.findUniqueOrThrow({
      where: { id: fileId, userId },
    });

    if (file.status !== 'safe') {
      throw new BadRequestException('File is not safe');
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
        this.logger.error({ error, message: 'Failed to hash link password' });
        throw new InternalServerErrorException();
      }

      password = data;
    }

    const link = await this.databaseService.link.create({
      data: {
        password,
        fileId,
        expiresAt: dto.expiresAt,
        description: dto.description,
      },
    });

    this.linksCreatedCounter.inc(1);

    return { id: link.id, shareId: link.shareId };
  }

  async getFileLinks(
    userId: string,
    fileId: string,
    cursor?: string,
  ): Promise<GetFileLinksResponseDto> {
    const limit = 10;

    const files = await this.databaseService.link.findMany({
      where: { fileId, file: { userId } },
      select: {
        id: true,
        password: true,
        revokedAt: true,
        createdAt: true,
        clickCount: true,
        expiresAt: true,
        shareId: true,
        description: true,
        lastAccessedAt: true,
      },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = files.length > limit;
    const data = files.slice(0, limit).map((file) => {
      const { password, ...safeFile } = file;

      return { ...safeFile, passwordProtected: password !== null };
    });
    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    return { data, hasNextPage, cursor: nextCursor };
  }

  async revokeLink(userId: string, fileId: string, linkId: string) {
    const linkDetails = await this.databaseService.link.findUniqueOrThrow({
      where: { id: linkId, fileId, file: { userId } },
    });

    if (linkDetails.revokedAt) {
      return { message: 'success' };
    }

    await this.databaseService.link.update({
      where: { id: linkId, fileId, file: { userId } },
      data: { revokedAt: new Date() },
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

    return { message: 'success' };
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
      where: { id: linkId, fileId, file: { userId } },
      data: {
        password,
        description: dto.description,
        expiresAt: dto.expiresAt,
      },
    });

    return { message: 'success' };
  }
}
