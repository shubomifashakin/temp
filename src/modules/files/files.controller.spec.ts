import { Request, Response } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
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

const mockDatabaseService = {
  files: {
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

const testUserId = 'test-user-id';
const mockRequest = {
  user: {
    id: testUserId,
  },
} as jest.Mocked<Request>;

const mockResponse = {
  redirect: jest.fn(),
} as unknown as jest.Mocked<Response>;

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService],
      controllers: [FilesController],
      imports: [
        DatabaseModule,
        RedisModule,
        S3Module,
        SqsModule,
        HasherModule,
        ConfigModule.forRoot({ isGlobal: true }),
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

    mockDatabaseService.files.create.mockResolvedValue({
      id: '1',
    });

    const res = await controller.uploadFile(
      mockRequest,
      { description: 'test description', lifetime: 'short' },
      {} as Express.Multer.File,
    );

    expect(res).toEqual({ id: '1' });
  });

  it('should get all files', async () => {
    mockDatabaseService.files.findMany.mockResolvedValue([]);

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

    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
      id: '1',
      size: 200,
    });

    const res = await controller.getSingleFile(mockRequest, '1');

    expect(res).toEqual({ id: '1', size: 200 });
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
    await controller.getLinkedFile(
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
