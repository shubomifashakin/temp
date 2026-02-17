import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { FilesService } from './files.service';

import { makeFileCacheKey } from './common/utils';

import { MINUTES_10 } from '../../common/constants';
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
    findUnique: jest.fn(),
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

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrometheusService, useValue: mockPrometheusService },
      ],
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
      .overrideProvider(SqsService)
      .useValue(mockSqsService)
      .overrideProvider(HasherService)
      .useValue(mockHasherService)
      .compile();

    service = module.get<FilesService>(FilesService);
    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should upload a file', async () => {
    const file = { size: 200 } as Express.Multer.File;
    const testUserId = 'test-user-id';

    mockDatabaseService.file.findUnique.mockResolvedValue(null);

    mockS3Service.uploadToS3.mockResolvedValue({ success: true, error: null });

    mockDatabaseService.file.create.mockResolvedValue({
      id: '1',
    });

    const res = await service.uploadFile(
      file,
      { description: 'Test file', lifetime: 'short', name: 'Test file' },
      testUserId,
    );

    expect(res).toEqual({ id: '1' });
    expect(mockIncrement).toHaveBeenCalledWith(
      { lifetime: 'short', size: '200' },
      1,
    );
  });

  it('should fail to upload a file because s3 failed', async () => {
    const file = {} as Express.Multer.File;
    const testUserId = 'test-user-id';

    mockDatabaseService.file.findUnique.mockResolvedValue(null);

    mockS3Service.uploadToS3.mockResolvedValue({
      success: false,
      error: new Error('test error'),
    });

    mockDatabaseService.file.create.mockResolvedValue({
      id: '1',
    });

    await expect(
      service.uploadFile(
        file,
        { description: 'Test file', lifetime: 'short', name: 'Test file' },
        testUserId,
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should fail to upload file because a file with that name already exists for user', async () => {
    const file = {} as Express.Multer.File;
    const testUserId = 'test-user-id';

    mockDatabaseService.file.findUnique.mockResolvedValue(true);

    await expect(
      service.uploadFile(
        file,
        { description: 'Test file', lifetime: 'short', name: 'Test file' },
        testUserId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should get all files', async () => {
    mockDatabaseService.file.findMany.mockResolvedValue([]);

    const res = await service.getFiles('test-user-id');

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

    const res = await service.getSingleFile('test-user-id', '1');

    expect(res).toEqual({ id: '1', size: 200 });
  });

  it('should get single file from cache', async () => {
    mockRedisService.get.mockResolvedValue({
      success: true,
      data: {
        id: '1',
        size: 200,
      },
      error: null,
    });

    const res = await service.getSingleFile('test-user-id', '1');

    expect(res).toEqual({ id: '1', size: 200 });
    expect(mockDatabaseService.file.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('should delete a single file', async () => {
    const testS3Key = 'test-key';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      s3_key: testS3Key,
    });

    mockSqsService.pushMessage.mockResolvedValue({
      success: true,
      error: null,
    });

    mockRedisService.delete.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.update.mockResolvedValue(true);

    const res = await service.deleteSingleFile('test-user-id', '1');

    expect(res).toEqual({ message: 'success' });
    expect(mockSqsService.pushMessage).toHaveBeenCalledWith({
      message: { s3Key: testS3Key },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      queueUrl: expect.any(String),
    });
    expect(mockRedisService.delete).toHaveBeenCalledWith(makeFileCacheKey('1'));
  });

  it('should not delete a single file, since it failed to push to sqs', async () => {
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      s3_key: 'test-key',
    });

    mockSqsService.pushMessage.mockResolvedValue({
      success: false,
      error: new Error('test error'),
    });

    await expect(service.deleteSingleFile('test-user-id', '1')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(mockDatabaseService.file.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('should update a single file', async () => {
    const resolvedValue = {
      id: '1',
      size: 200,
    };
    mockDatabaseService.file.update.mockResolvedValue(resolvedValue);

    mockRedisService.set.mockResolvedValue({
      success: true,
      error: null,
    });

    const res = await service.updateSingleFile('test-user-id', '1', {
      description: 'Test file',
    });

    expect(res).toEqual(resolvedValue);

    expect(mockRedisService.set).toHaveBeenCalledWith(
      makeFileCacheKey('1'),
      resolvedValue,
      { expiration: { type: 'EX', value: MINUTES_10 } },
    );
  });

  it('should generate link for a file', async () => {
    const testFileId = 'test-file-id';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: testFileId,
      size: 200,
      status: 'safe',
      deleted_at: null,
      expires_at: new Date(Date.now() * 100),
      password: null,
    });

    const testLinkId = 'test-link-id';
    mockDatabaseService.link.create.mockResolvedValue({
      id: testLinkId,
    });

    const testUserId = 'test-user-id';

    const res = await service.createLink(testUserId, testFileId, {
      description: 'Test file',
      expiresAt: new Date(),
      password: undefined,
    });

    expect(res).toEqual({ id: testLinkId });
    expect(mockIncrement).toHaveBeenCalled();
  });

  it('should generate link for a file with a password', async () => {
    const testFileId = 'test-file-id';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: testFileId,
      size: 200,
      status: 'safe',
      deleted_at: null,
      expires_at: new Date(Date.now() * 100),
      password: null,
    });

    const testLinkId = 'test-link-id';
    mockDatabaseService.link.create.mockResolvedValue({
      id: testLinkId,
    });

    const testUserId = 'test-user-id';

    mockHasherService.hashPassword.mockResolvedValue({
      success: true,
      data: 'test-password-hash',
      error: null,
    });

    const res = await service.createLink(testUserId, testFileId, {
      description: 'Test file',
      expiresAt: new Date(),
      password: 'test-password',
    });

    expect(res).toEqual({ id: testLinkId });
    expect(mockHasherService.hashPassword).toHaveBeenCalledWith(
      'test-password',
    );
  });

  it('should not generate link for file that is not safe', async () => {
    const testFileId = 'test-file-id';
    const testUserId = 'test-user-id';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: testFileId,
      size: 200,
      status: 'pending',
      deleted_at: null,
      expires_at: new Date(Date.now() * 100),
      password: null,
    });

    await expect(
      service.createLink(testUserId, testFileId, {
        description: 'Test file',
        expiresAt: new Date(),
        password: 'test-password',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should not generate link for file that is deleted', async () => {
    const testFileId = 'test-file-id';
    const testUserId = 'test-user-id';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: testFileId,
      size: 200,
      status: 'safe',
      deleted_at: new Date(),
      expires_at: new Date(Date.now() * 100),
      password: null,
    });

    await expect(
      service.createLink(testUserId, testFileId, {
        description: 'Test file',
        expiresAt: new Date(),
        password: 'test-password',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should not generate link for file that is expired', async () => {
    const testFileId = 'test-file-id';
    const testUserId = 'test-user-id';
    mockDatabaseService.file.findUniqueOrThrow.mockResolvedValue({
      id: testFileId,
      size: 200,
      status: 'safe',
      deleted_at: null,
      expires_at: new Date(Date.now() - 100000),
      password: null,
    });

    await expect(
      service.createLink(testUserId, testFileId, {
        description: 'Test file',
        expiresAt: new Date(),
        password: 'test-password',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should get all links that have been generated for a file', async () => {
    mockDatabaseService.link.findMany.mockResolvedValue([]);

    const res = await service.getFileLinks('test-user-id', 'test-file-id');

    expect(res).toEqual({ data: [], hasNextPage: false, cursor: null });
  });

  it('should revoke link', async () => {
    const testFileId = 'test-file-id';
    const testLinkId = 'test-link-id';
    const testUserId = 'test-user-id';

    mockDatabaseService.link.findUniqueOrThrow.mockResolvedValue({
      revoked_at: null,
    });

    mockDatabaseService.link.update.mockResolvedValue(true);

    mockRedisService.delete.mockResolvedValue({
      error: null,
      success: true,
    });

    const res = await service.revokeLink(testUserId, testFileId, testLinkId);

    expect(res).toEqual({ message: 'success' });
    expect(mockDatabaseService.link.update).toHaveBeenCalledWith({
      where: {
        id: testLinkId,
        file_id: testFileId,
        file: {
          user_id: testUserId,
        },
      },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revoked_at: expect.any(Date),
      },
    });
  });
});
