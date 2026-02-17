import { Request, Response } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';

import { S3Module } from '../../core/s3/s3.module';
import { S3Service } from '../../core/s3/s3.service';
import { SqsModule } from '../../core/sqs/sqs.module';
import { SqsService } from '../../core/sqs/sqs.service';
import { RedisModule } from '../../core/redis/redis.module';
import { RedisService } from '../../core/redis/redis.service';
import { HasherModule } from '../../core/hasher/hasher.module';
import { HasherService } from '../../core/hasher/hasher.service';
import { DatabaseModule } from '../../core/database/database.module';
import { DatabaseService } from '../../core/database/database.service';
import { PrometheusModule } from '../../core/prometheus/prometheus.module';
import { PrometheusService } from '../../core/prometheus/prometheus.service';

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

const mockSqsService = {
  pushMessage: jest.fn(),
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

const mockIncrement = jest.fn();
const mockPrometheusService = {
  createCounter: jest.fn().mockReturnValue({
    inc: mockIncrement,
  }),
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
      providers: [
        FilesService,
        { useValue: mockPrometheusService, provide: PrometheusService },
      ],
      controllers: [FilesController],
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
      .overrideProvider(SqsService)
      .useValue(mockSqsService)
      .overrideProvider(HasherService)
      .useValue(mockHasherService)
      .compile();

    controller = module.get<FilesController>(FilesController);
    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should upload the file', async () => {
    mockS3Service.uploadToS3.mockResolvedValue({ success: true, error: null });

    mockDatabaseService.file.create.mockResolvedValue({
      id: '1',
    });

    const res = await controller.uploadFile(
      mockRequest,
      { description: 'test description', lifetime: 'short' },
      { size: 1024 } as Express.Multer.File,
    );

    expect(res).toEqual({ id: '1' });
  });

  it('should not allow free user to upload large file', async () => {
    mockS3Service.uploadToS3.mockResolvedValue({ success: true, error: null });

    mockDatabaseService.file.create.mockResolvedValue({
      id: '1',
    });

    await expect(
      controller.uploadFile(
        mockRequest,
        { description: 'test description', lifetime: 'short' },
        { size: 1024 * 10000 * 1000 } as Express.Multer.File,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should get all files', async () => {
    mockDatabaseService.file.findMany.mockResolvedValue([]);

    const res = await controller.getFiles(mockRequest);

    expect(res).toEqual({ data: [], hasNextPage: false, cursor: null });
  });

  it('should get single file', async () => {
    mockRedisService.get.mockResolvedValue({
      success: true,
      data: null,
      error: null,
    });

    mockRedisService.set.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: '1',
      size: 200,
    });

    const res = await controller.getSingleFile(mockRequest, '1');

    expect(res).toEqual({ id: '1', size: 200 });
  });
});
