import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { FilesService } from './files.service';

import { makeFileCacheKey, makePresignedUrlCacheKey } from './common/utils';

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

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService],
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule,
        S3Module,
        SqsModule,
        RedisModule,
        HasherModule,
        DatabaseModule,
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
    const file = {} as Express.Multer.File;
    const testUserId = 'test-user-id';

    mockS3Service.uploadToS3.mockResolvedValue({ success: true, error: null });

    mockDatabaseService.files.create.mockResolvedValue({
      id: '1',
    });

    const res = await service.uploadFile(
      file,
      { description: 'Test file', lifetime: 'short' },
      testUserId,
    );

    expect(res).toEqual({ id: '1' });
  });

  it('should fail to upload a file', async () => {
    const file = {} as Express.Multer.File;
    const testUserId = 'test-user-id';

    mockS3Service.uploadToS3.mockResolvedValue({
      success: false,
      error: new Error('test error'),
    });

    mockDatabaseService.files.create.mockResolvedValue({
      id: '1',
    });

    await expect(
      service.uploadFile(
        file,
        { description: 'Test file', lifetime: 'short' },
        testUserId,
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('should get all files', async () => {
    mockDatabaseService.files.findMany.mockResolvedValue([]);

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

    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
    expect(mockDatabaseService.files.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('should delete a single file', async () => {
    const testS3Key = 'test-key';
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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

    mockDatabaseService.files.update.mockResolvedValue(true);

    const res = await service.deleteSingleFile('test-user-id', '1');

    expect(res).toEqual({ message: 'success' });
    expect(mockSqsService.pushMessage).toHaveBeenCalledWith({
      message: { s3Key: testS3Key },
      queueUrl: expect.any(String),
    });
    expect(mockRedisService.delete).toHaveBeenCalledWith(makeFileCacheKey('1'));
  });

  it('should not delete a single file, since it failed to push to sqs', async () => {
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
      s3_key: 'test-key',
    });

    mockSqsService.pushMessage.mockResolvedValue({
      success: false,
      error: new Error('test error'),
    });

    await expect(service.deleteSingleFile('test-user-id', '1')).rejects.toThrow(
      InternalServerErrorException,
    );
    expect(mockDatabaseService.files.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('should update a single file', async () => {
    const resolvedValue = {
      id: '1',
      size: 200,
    };
    mockDatabaseService.files.update.mockResolvedValue(resolvedValue);

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
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
  });

  it('should generate link for a file with a password', async () => {
    const testFileId = 'test-file-id';
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
    mockDatabaseService.files.findUniqueOrThrow.mockResolvedValue({
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
