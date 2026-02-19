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
        .attach('file', Buffer.from('test file content'), 'test.png')
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
          s3_key: `test-file-${i}`,
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          name: `Test File ${i}`,
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'pending',
          name: 'Test File',
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
      expect(response.body).toHaveProperty('expires_at');
      expect(response.body.expires_at).toBeDefined();
      expect(response.body).toHaveProperty('size');
      expect(response.body.size).toEqual(1024);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toEqual('pending');
      expect(response.body).toHaveProperty('user_id');
      expect(response.body.user_id).toEqual(userId.id);

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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'pending',
          name: 'Test File',
        },
        select: {
          id: true,
          deleted_at: true,
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
          user_id: userId.id,
        },
      });

      expect(fileId.deleted_at).toBeNull();
      expect(file?.deleted_at).toEqual(expect.any(Date));
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'pending',
          name: 'Test File',
        },
        select: {
          id: true,
          deleted_at: true,
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'pending',
          name: 'Test File',
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'safe',
          name: 'Test File',
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'safe',
          name: 'Test File',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.create({
        data: {
          file_id: fileId.id,
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
              provider_customer_id: 'test-provider-customer',
              provider_subscription_id: 'subscription_id',
              status: 'ACTIVE',
              provider: 'POLAR',
              current_period_end: new Date(
                Date.now() + 1000 * 60 * 60 * 24 * 30,
              ),
              current_period_start: new Date(),
              interval: 'MONTH',
              interval_count: 1,
              plan: 'PRO',
              currency: 'usd',
              product_id: 'test',
              cancel_at_period_end: false,
              started_at: new Date(),
              amount: 20,
              last_event_at: new Date(),
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'safe',
          name: 'Test File',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.create({
        data: {
          file_id: fileId.id,
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'pending',
          name: 'Test File',
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          status: 'safe',
          deleted_at: new Date(),
          name: 'Test File',
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
          s3_key: 'test-file',
          expires_at: new Date(100),
          size: 1024,
          user_id: userId.id,
          status: 'safe',
          name: 'Test File',
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
          s3_key: 'test-file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          size: 1024,
          user_id: userId.id,
          name: 'Test File',
          status: 'safe',
        },
        select: {
          id: true,
        },
      });

      await databaseService.link.createMany({
        data: Array.from({ length: 15 }).map((_, idx) => ({
          file_id: fileId.id,
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
          user_id: user.id,
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
          name: 'Test file',
        },
      });

      const link = await databaseService.link.create({
        data: {
          id: 'test-link-id',
          file_id: file.id,
          description: 'Test link',
        },
        select: {
          id: true,
          revoked_at: true,
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

      expect(link.revoked_at).toBeNull();
      expect(revokedState.revoked_at).not.toBeNull();
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
          user_id: user.id,
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          name: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const link = await databaseService.link.create({
        data: {
          id: 'test-link-id',
          file_id: file.id,
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
