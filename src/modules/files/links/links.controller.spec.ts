import { Response } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { LinksController } from './links.controller';
import { LinksService } from './links.service';

import { S3Service } from '../../../core/s3/s3.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';
import { DatabaseModule } from '../../../core/database/database.module';
import { RedisModule } from '../../../core/redis/redis.module';
import { S3Module } from '../../../core/s3/s3.module';
import { SqsModule } from '../../../core/sqs/sqs.module';
import { HasherModule } from '../../../core/hasher/hasher.module';
import { PrometheusModule } from '../../../core/prometheus/prometheus.module';

const mockResponse = {
  redirect: jest.fn(),
} as unknown as jest.Mocked<Response>;

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

describe('LinksController', () => {
  let controller: LinksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [LinksService],
      imports: [
        DatabaseModule,
        RedisModule,
        S3Module,
        SqsModule,
        HasherModule,
        ConfigModule.forRoot({ isGlobal: true }),
        PrometheusModule,
        JwtModule,
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .compile();

    controller = module.get<LinksController>(LinksController);

    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
    await controller.getLinkFile(
      mockResponse,
      {
        password: undefined,
      },
      testLinkId,
    );

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockResponse.redirect).toHaveBeenCalledWith(302, testPresignedUrl);
  });
});
