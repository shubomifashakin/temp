import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { LinksService } from './links.service';
import { makePresignedUrlCacheKey } from '../common/utils';

import { S3Service } from '../../../core/s3/s3.service';
import { RedisService } from '../../../core/redis/redis.service';
import { HasherService } from '../../../core/hasher/hasher.service';
import { DatabaseService } from '../../../core/database/database.service';
import { S3Module } from '../../../core/s3/s3.module';
import { SqsModule } from '../../../core/sqs/sqs.module';
import { RedisModule } from '../../../core/redis/redis.module';
import { HasherModule } from '../../../core/hasher/hasher.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { PrometheusModule } from '../../../core/prometheus/prometheus.module';
import { AppConfigModule } from '../../../core/app-config/app-config.module';
import { AppConfigService } from '../../../core/app-config/app-config.service';

const mockDatabaseService = {
  file: {
    create: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  link: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

const mockConfigService = {
  S3BucketName: {
    data: 'test-bucket',
  },
  AwsRegion: {
    data: 'test-region',
    success: true,
    error: null,
  },
  AwsAccessKey: {
    data: 'test-access-key',
    success: true,
    error: null,
  },
  AwsSecretKey: {
    data: 'test-secret-key',
    success: true,
    error: null,
  },
  ServiceName: {
    data: 'test-service-name',
    success: true,
    error: null,
  },
  NodeEnv: {
    data: 'test-node-env',
    success: true,
    error: null,
  },
};

const mockS3Service = {
  uploadToS3: jest.fn(),
  generatePresignedGetUrl: jest.fn(),
};

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

const mockHasherService = {
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
};

describe('LinksService', () => {
  let service: LinksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LinksService],
      imports: [
        AppConfigModule,
        JwtModule,
        S3Module,
        SqsModule,
        RedisModule,
        HasherModule,
        DatabaseModule,
        PrometheusModule,
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .overrideProvider(HasherService)
      .useValue(mockHasherService)
      .overrideProvider(AppConfigService)
      .useValue(mockConfigService)
      .compile();

    service = module.get<LinksService>(LinksService);
    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get link details', async () => {
    const resolvedValue = {
      password: 'test-password',
      expiresAt: new Date(),
      createdAt: new Date(),
      clickCount: 1,
      description: 'test description',
      lastAccessedAt: new Date(),

      file: {
        name: 'file name',
        status: 'file status',
        deletedAt: new Date(),
        description: 'test description',
        contentType: 'application/json',
        expiresAt: new Date(),
        size: 1999,
        user: {
          name: 'Test Name',
          picture: 'https://image.com',
        },
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const res = await service.getLinkDetails('test-link-id');

    expect(res).toEqual({
      createdAt: resolvedValue.createdAt,
      expiresAt: resolvedValue.expiresAt,
      description: resolvedValue.description,
      clickCount: resolvedValue.clickCount,
      lastAccessedAt: resolvedValue.lastAccessedAt,
      passwordProtected: resolvedValue.password !== null,

      fileName: resolvedValue.file.name,
      fileCreator: resolvedValue.file.user.name,
      fileStatus: resolvedValue.file.status,
      fileSize: resolvedValue.file.size,
      fileDescription: resolvedValue.file.description,
      fileCreatorPicture: resolvedValue.file.user.picture,
      fileDeleted: resolvedValue.file.deletedAt !== null,
      fileContentType: resolvedValue.file.contentType,
      fileExpired: new Date() > resolvedValue.file.expiresAt,
    });
  });

  it('should generate the presigned url for the file', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: null,
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    mockRedisService.get.mockResolvedValue({
      success: true,
      error: null,
      data: null,
    });

    const testPresignedUrl = 'test-presigned-url';
    mockS3Service.generatePresignedGetUrl.mockResolvedValue({
      success: true,
      error: null,
      data: testPresignedUrl,
    });

    mockRedisService.set.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.link.update.mockResolvedValue(true);

    const testLinkId = 'test-link-id';
    const res = await service.getLinkFile(testLinkId, {
      password: undefined,
    });

    expect(res).toEqual({
      url: testPresignedUrl,
    });
  });

  it('should use the cached presigned url for the file', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: null,
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const testPresignedUrl = 'test-presigned-url';
    mockRedisService.get.mockResolvedValue({
      success: true,
      error: null,
      data: testPresignedUrl,
    });

    mockRedisService.set.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.link.update.mockResolvedValue(true);

    const testLinkId = 'test-link-id';
    const res = await service.getLinkFile(testLinkId, {
      password: undefined,
    });

    expect(res).toEqual({
      url: testPresignedUrl,
    });
    expect(mockRedisService.get).toHaveBeenCalledWith(
      makePresignedUrlCacheKey(testLinkId),
    );
    expect(mockS3Service.generatePresignedGetUrl).not.toHaveBeenCalled();
  });

  it('should not generate the presigned url for the file since link has expired', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() - 100000),
      deletedAt: null,
      password: null,
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const testLinkId = 'test-link-id';
    await expect(
      service.getLinkFile(testLinkId, {
        password: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not generate the presigned url for the file since link has been revoked', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: null,
      revokedAt: new Date(),
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const testLinkId = 'test-link-id';
    await expect(
      service.getLinkFile(testLinkId, {
        password: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not generate the presigned url for the file since file has been deleted', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: null,
      file: {
        s3Key: 'test-s3-key',
        deletedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const testLinkId = 'test-link-id';
    await expect(
      service.getLinkFile(testLinkId, {
        password: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not generate the presigned url for the file since file has expired', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: null,
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() - 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const testLinkId = 'test-link-id';
    await expect(
      service.getLinkFile(testLinkId, {
        password: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not generate the presigned url for the file since password supplied is incorrect', async () => {
    const resolvedValue = {
      expiresAt: new Date(Date.now() + 100000),
      deletedAt: null,
      password: 'test-password',
      file: {
        s3Key: 'test-s3-key',
        deletedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    mockHasherService.verifyPassword.mockResolvedValue({
      success: true,
      data: false,
      error: null,
    });

    const testLinkId = 'test-link-id';
    await expect(
      service.getLinkFile(testLinkId, {
        password: 'incorrect-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
