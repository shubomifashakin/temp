/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import request from 'supertest';
import { App } from 'supertest/types';

import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';

import cookieParser from 'cookie-parser';

import { Test, TestingModule } from '@nestjs/testing';

import {
  ValidationPipe,
  INestApplication,
  BadRequestException,
} from '@nestjs/common';

import { AppModule } from '../src/app.module';

import { ValidationError } from 'class-validator';

import { S3Service } from '../src/core/s3/s3.service';
import { SqsService } from '../src/core/sqs/sqs.service';
import { RedisService } from '../src/core/redis/redis.service';
import { DatabaseService } from '../src/core/database/database.service';
import { makeFileCacheKey } from '../src/modules/files/common/utils';
import { PrismaClientKnownRequestFilterFilter } from '../src/common/filters/prisma-client-known-request.filter';
import { PrismaClientUnknownRequestFilterFilter } from '../src/common/filters/prisma-client-unknown-request.filter';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

const mockS3Service = {
  uploadToS3: jest.fn(),
  generatePresignedGetUrl: jest.fn(),
};

const mockSqsService = {
  pushMessage: jest.fn(),
};

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

const mockJwtService = {
  verifyAsync: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const testEmail = 'test@example.com';

describe('FilesController (e2e)', () => {
  let app: INestApplication<App>;

  let redisService: RedisService;

  let databaseService: DatabaseService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Logger)
      .useValue(mockLogger)
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
      .overrideProvider(S3Service)
      .useValue(mockS3Service)
      .overrideProvider(SqsService)
      .useValue(mockSqsService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useLogger(mockLogger);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        stopAtFirstError: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors: ValidationError[] = []) => {
          const firstError = errors[0];

          let message = 'Invalid Payload';

          if (firstError?.constraints) {
            message = Object.values(firstError.constraints)[0];
          }

          return new BadRequestException(message);
        },
      }),
    );

    app.useGlobalFilters(
      new PrismaClientKnownRequestFilterFilter(),
      new PrismaClientUnknownRequestFilterFilter(),
    );

    app.use(cookieParser());
    await app.init();

    redisService = moduleFixture.get(RedisService);

    databaseService = moduleFixture.get(DatabaseService);

    jest.clearAllMocks();

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /files', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should not upload the file if the user is not signed in', async () => {
      await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.txt');

      expect(response.status).toBe(401);
    });

    it('should not upload an unsupported file type', async () => {
      await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: 'test-user-id',
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.exe')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(400);
    });

    it(
      'should not upload a very large file, larger than max',
      async () => {
        await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
          },
        });

        mockJwtService.verifyAsync.mockResolvedValue({
          jti: 'test-jti',
          userId: 'test-user-id',
        });

        const response = await request(app.getHttpServer())
          .post('/files')
          .attach('file', Buffer.alloc(160 * 1024 * 1024, 'x'), 'test.png')
          .field('lifetime', 'short')
          .field('description', 'This is a test file')
          .field('name', 'Test File')
          .set('Cookie', ['access_token=test-token']);

        expect(response.status).toBe(413);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('large');
      },
      100 * 1000,
    );

    it(
      'should not allow a free user to  upload a file larger than their limit',
      async () => {
        await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
          },
        });

        mockJwtService.verifyAsync.mockResolvedValue({
          jti: 'test-jti',
          userId: 'test-user-id',
        });

        const response = await request(app.getHttpServer())
          .post('/files')
          .attach('file', Buffer.alloc(50 * 1024 * 1024, 'x'), 'test.png')
          .field('lifetime', 'short')
          .field('description', 'This is a test file')
          .field('name', 'Test File')
          .set('Cookie', ['access_token=test-token']);

        expect(response.status).toBe(413);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('plan');
      },
      100 * 1000,
    );

    it('should not upload the file if there is no description', async () => {
      await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: 'test-user-id',
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.png')
        .field('lifetime', 'long')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(400);
    });

    it('should not allow a free user to upload with a long lifetime', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.png')
        .field('lifetime', 'long')
        .field('description', 'This is a test file')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(400);
    });

    it('should upload the file successfully', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      mockS3Service.uploadToS3.mockResolvedValue({
        success: true,
        error: 'fake',
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.alloc(20 * 1024 * 1024, 'x'), 'test.png')
        .field('lifetime', 'short')
        .field('description', 'This is a test file')
        .field('name', 'Test File')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should not upload the file if s3 failed', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      mockS3Service.uploadToS3.mockResolvedValue({
        success: false,
        error: new Error('failed to upload to s3'),
      });

      const response = await request(app.getHttpServer())
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.png')
        .field('lifetime', 'short')
        .field('description', 'This is a test file')
        .field('name', 'Test File')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(500);
    });
  });

  describe('GET /files', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should get the files', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('cursor');

      expect(response.body?.cursor).toBe(null);
      expect(response.body).toHaveProperty('hasNextPage');
    });

    it('should get the files and have a next page', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      await databaseService.file.createMany({
        data: Array.from({ length: 20 }).map((_, i) => ({
          description: `Test File ${i}`,
          s3Key: `test-file-${i}`,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          name: `Test File ${i}`,
          contentType: 'text/plain',
        })),
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(10);
      expect(response.body).toHaveProperty('cursor');
      expect(response.body).toHaveProperty('hasNextPage');
      expect(response.body?.hasNextPage).toBe(true);
    });

    it('should not get the files if the user is not signed in', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get('/files')
        .set('Cookie', []);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /files/:id', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should get the file', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'pending',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId.id}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toEqual(fileId.id);
      expect(response.body).toHaveProperty('description');
      expect(response.body.description).toEqual('Test File');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body).toHaveProperty('size');
      expect(response.body.size).toEqual(1024);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toEqual('pending');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.userId).toEqual(userId.id);

      await redisService.delete(makeFileCacheKey(fileId.id));
    });

    it('should not get the file if the file does not exist', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = 'test-file-id';

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /files/:id', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should delete the file', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'pending',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      mockSqsService.pushMessage.mockResolvedValue({
        success: true,
        error: null,
      });

      const response = await request(app.getHttpServer())
        .delete(`/files/${fileId.id}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      const file = await databaseService.file.findFirst({
        where: {
          id: fileId.id,
          userId: userId.id,
        },
      });

      expect(fileId.deletedAt).toBeNull();
      expect(file?.deletedAt).toEqual(expect.any(Date));
    });

    it('should not delete the file if the file does not exist', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = 'test-file-id';

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(404);
    });

    it('should not delete the file since sqs failed', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'pending',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      mockSqsService.pushMessage.mockResolvedValue({
        success: false,
        error: new Error('SQS Failed error'),
      });

      const response = await request(app.getHttpServer())
        .delete(`/files/${fileId.id}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('PATCH /files/:id', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should update the file', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'pending',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .patch(`/files/${fileId.id}`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Updated Test File',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body.id).toEqual(fileId.id);
      expect(response.body).toHaveProperty('description');
      expect(response.body.description).toEqual('Updated Test File');

      await redisService.delete(makeFileCacheKey(fileId.id));
    });

    it('should not update the file if the file does not exist', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = 'test-file-id';

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .patch(`/files/${fileId}`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Updated Test File',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /files/:id/links', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should create a link for the file if the file is safe', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'safe',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should not create another link for the file if the user is not subscribed and has already created a link', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'safe',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.create({
        data: {
          fileId: fileId.id,
          description: 'Test link',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should create another link for the file if the user is subscribed', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
          subscriptions: {
            create: {
              providerCustomerId: 'test-provider-customer',
              providerSubscriptionId: 'subscription_id',
              status: 'active',
              provider: 'polar',
              currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
              currentPeriodStart: new Date(),
              interval: 'month',
              intervalCount: 1,
              plan: 'pro',
              currency: 'usd',
              productId: 'test',
              cancelAtPeriodEnd: false,
              startedAt: new Date(),
              amount: 20,
              lastEventAt: new Date(),
            },
          },
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'safe',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.create({
        data: {
          fileId: fileId.id,
          description: 'Test link',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should not create a link for the file if the file is not safe', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'pending',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create a link for the file if the file has been deleted', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          status: 'safe',
          deletedAt: new Date(),
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create a link for the file if the file has expired', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(100),
          size: 1024,
          userId: userId.id,
          status: 'safe',
          name: 'Test File',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create a link for the file because it does not exist', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = 'test-file-id';

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .post(`/files/${fileId}/links`)
        .set('Cookie', ['access_token=test-token'])
        .send({
          description: 'Test link',
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /files/:id/links', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should get all links for the file', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      const fileId = await databaseService.file.create({
        data: {
          description: 'Test File',
          s3Key: 'test-file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          userId: userId.id,
          name: 'Test File',
          status: 'safe',
          contentType: 'text/plain',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.createMany({
        data: Array.from({ length: 15 }).map((_, idx) => ({
          fileId: fileId.id,
          description: `Test Link ${idx}`,
        })),
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId.id}/links`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.length).toBe(10);
      expect(response.body).toHaveProperty('hasNextPage');
      expect(response.body.hasNextPage).toBe(true);
      expect(response.body).toHaveProperty('cursor');
    });

    it('should not get links because user is not signed in', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
        select: {
          id: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get(`/files/${'fileId.id'}/links`)
        .set('Cookie', []);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });
  });

  //from here
  describe('DELETE /files/:id/links/:linkId', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
      await databaseService.file.deleteMany();
      await databaseService.link.deleteMany();
    });

    it('should not revoke a link if user is not signed in', async () => {
      await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'Test User',
        },
      });

      const response = await request(app.getHttpServer()).delete(
        `/files/${'file.id'}/links/${'link.id'}`,
      );

      expect(response.status).toBe(401);
    });

    it('should revoke a link successfully', async () => {
      const user = await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'Test User',
        },
      });

      const file = await databaseService.file.create({
        data: {
          id: 'test-file-id',
          userId: user.id,
          s3Key: 'test-key',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          name: 'Test file',
          contentType: 'text/plain',
        },
      });

      const link = await databaseService.link.create({
        data: {
          id: 'test-link-id',
          fileId: file.id,
          description: 'Test link',
        },
        select: {
          id: true,
          revokedAt: true,
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .delete(`/files/${file.id}/links/${link.id}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });

      const revokedState = await databaseService.link.findUniqueOrThrow({
        where: {
          id: link.id,
        },
      });

      expect(link.revokedAt).toBeNull();
      expect(revokedState.revokedAt).not.toBeNull();
    });
  });

  describe('PATCH /files/:id/links/:linkId', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
      await databaseService.file.deleteMany();
      await databaseService.link.deleteMany();
    });

    it('should not update a link if user is not signed in', async () => {
      await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'Test User',
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/files/fileId/links/linkId`)
        .send({ description: 'Updated description' });

      expect(response.status).toBe(401);
    });

    it('should update a link successfully', async () => {
      const user = await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'Test User',
        },
      });

      const file = await databaseService.file.create({
        data: {
          id: 'test-file-id',
          userId: user.id,
          s3Key: 'test-key',
          size: 100,
          description: 'Test file',
          name: 'Test file',
          contentType: 'text/plain',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const link = await databaseService.link.create({
        data: {
          id: 'test-link-id',
          fileId: file.id,
          description: 'Test link',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .patch(`/files/${file.id}/links/${link.id}`)
        .send({ description: 'Updated description' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);

      const updatedLink = await databaseService.link.findUnique({
        where: {
          id: link.id,
        },
        select: {
          description: true,
        },
      });

      expect(updatedLink?.description).toBe('Updated description');
    });
  });
});
