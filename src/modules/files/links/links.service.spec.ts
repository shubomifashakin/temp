import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
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
        ConfigModule.forRoot({ isGlobal: true }),
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
      created_at: new Date(),
      expires_at: new Date(),
      description: 'test description',
      click_count: 1,
      last_accessed_at: new Date(),
      password: 'test-password',

      file: {
        user: {
          name: 'Test Name',
        },
        status: 'safe',
        description: 'Test file description',
        deleted_at: null,
      },
    };

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue(resolvedValue);

    const res = await service.getLinkDetails('test-link-id');

    expect(res).toEqual({
      created_at: resolvedValue.created_at,
      expires_at: resolvedValue.expires_at,
      description: resolvedValue.description,
      click_count: resolvedValue.click_count,
      last_accessed_at: resolvedValue.last_accessed_at,
      password_protected: resolvedValue.password !== null,

      file_creator: resolvedValue.file.user.name,
      file_status: resolvedValue.file.status,
      file_description: resolvedValue.file.description,
      file_deleted: resolvedValue.file.deleted_at !== null,
    });
  });

  it('should generate the presigned url for the file', async () => {
    const resolvedValue = {
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: null,
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() + 100000),
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
      fileUrl: testPresignedUrl,
    });
  });

  it('should use the cached presigned url for the file', async () => {
    const resolvedValue = {
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: null,
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() + 100000),
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
      fileUrl: testPresignedUrl,
    });
    expect(mockRedisService.get).toHaveBeenCalledWith(
      makePresignedUrlCacheKey(testLinkId),
    );
    expect(mockS3Service.generatePresignedGetUrl).not.toHaveBeenCalled();
  });

  it('should not generate the presigned url for the file since link has expired', async () => {
    const resolvedValue = {
      expires_at: new Date(Date.now() - 100000),
      deleted_at: null,
      password: null,
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() + 100000),
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
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: null,
      revoked_at: new Date(),
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() + 100000),
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
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: null,
      file: {
        s3_key: 'test-s3-key',
        deleted_at: new Date(),
        expires_at: new Date(Date.now() + 100000),
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
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: null,
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() - 100000),
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
      expires_at: new Date(Date.now() + 100000),
      deleted_at: null,
      password: 'test-password',
      file: {
        s3_key: 'test-s3-key',
        deleted_at: null,
        expires_at: new Date(Date.now() + 100000),
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
