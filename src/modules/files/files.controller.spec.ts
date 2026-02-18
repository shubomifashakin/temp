import { Request, Response } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';

import { S3Module } from '../../core/s3/s3.module';
import { SqsModule } from '../../core/sqs/sqs.module';
import { RedisModule } from '../../core/redis/redis.module';
import { HasherModule } from '../../core/hasher/hasher.module';
import { DatabaseModule } from '../../core/database/database.module';
import { PrometheusModule } from '../../core/prometheus/prometheus.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

const mockFilesService = {
  uploadFile: jest.fn(),
  getFiles: jest.fn(),
  getSingleFile: jest.fn(),
  deleteSingleFile: jest.fn(),
  updateSingleFile: jest.fn(),
  createLink: jest.fn(),
  getFileLinks: jest.fn(),
  revokeLink: jest.fn(),
  updateLink: jest.fn(),
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
};

const testUserId = 'test-user-id';
const mockRequest = {
  user: {
    id: testUserId,
    plan: 'FREE',
  },
} as jest.Mocked<Request>;

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [{ useValue: mockFilesService, provide: FilesService }],
      controllers: [FilesController],
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

    controller = module.get<FilesController>(FilesController);
    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should upload the file', async () => {
    mockFilesService.uploadFile.mockResolvedValue({ id: '1' });

    const res = await controller.uploadFile(
      mockRequest,
      { description: 'test description', lifetime: 'short', name: 'test name' },
      { size: 1024 } as Express.Multer.File,
    );

    expect(res).toEqual({ id: '1' });
  });

  it('should not allow free user to upload large file', async () => {
    await expect(
      controller.uploadFile(
        mockRequest,
        {
          description: 'test description',
          lifetime: 'short',
          name: 'test name',
        },
        { size: 1024 * 10000 * 1000 } as Express.Multer.File,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should get all files', async () => {
    mockFilesService.getFiles.mockResolvedValue({
      data: [],
      hasNextPage: false,
      cursor: null,
    });

    const res = await controller.getFiles(mockRequest);

    expect(res).toEqual({ data: [], hasNextPage: false, cursor: null });
  });

  it('should get single file', async () => {
    mockFilesService.getSingleFile.mockResolvedValue({ id: '1', size: 200 });

    const res = await controller.getSingleFile(mockRequest, '1');

    expect(res).toEqual({ id: '1', size: 200 });
  });
});
