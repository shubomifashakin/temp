import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { LinksController } from './links.controller';
import { LinksService } from './links.service';

import { DatabaseModule } from '../../../core/database/database.module';
import { RedisModule } from '../../../core/redis/redis.module';
import { S3Module } from '../../../core/s3/s3.module';
import { SqsModule } from '../../../core/sqs/sqs.module';
import { HasherModule } from '../../../core/hasher/hasher.module';
import { PrometheusModule } from '../../../core/prometheus/prometheus.module';
import { AppConfigModule } from '../../../core/app-config/app-config.module';
import { AppConfigService } from '../../../core/app-config/app-config.service';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

const mockAppConfigService = {
  RedisUrl: {
    data: undefined,
    success: true,
  },
  DatabaseUrl: {
    data: undefined,
    success: true,
  },
  AwsAccessKey: {
    data: 'test-value',
    success: true,
  },
  AwsSecretKey: {
    data: 'test-value',
    success: true,
  },
  AwsRegion: {
    data: 'test-value',
    success: true,
  },
  NodeEnv: {
    data: 'test-value',
    success: true,
  },
  ServiceName: {
    data: 'test-value',
    success: true,
  },
  S3BucketName: {
    data: 'test-value',
    success: true,
  },
};

const mockLinksService = {
  getLinkDetails: jest.fn(),
  getLinkFile: jest.fn(),
};

describe('LinksController', () => {
  let controller: LinksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksService, useValue: mockLinksService }],
      imports: [
        DatabaseModule,
        RedisModule,
        S3Module,
        SqsModule,
        HasherModule,
        AppConfigModule,
        PrometheusModule,
        JwtModule,
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<LinksController>(LinksController);

    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should generate the presigned url for the file', async () => {
    const testPresignedUrl = 'test-presigned-url';
    mockLinksService.getLinkFile.mockResolvedValue({
      url: testPresignedUrl,
    });

    const testLinkId = 'test-link-id';
    const response = await controller.getLinkFile(
      {
        password: undefined,
      },
      testLinkId,
    );

    expect(response.url).toEqual(testPresignedUrl);
  });
});
