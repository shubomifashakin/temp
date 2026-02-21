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
import { DatabaseService } from '../src/core/database/database.service';
import { PrismaClientKnownRequestFilterFilter } from '../src/common/filters/prisma-client-known-request.filter';
import { PrismaClientUnknownRequestFilterFilter } from '../src/common/filters/prisma-client-unknown-request.filter';
import { RedisService } from '../src/core/redis/redis.service';

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

describe('FilesLinksController (e2e)', () => {
  let app: INestApplication<App>;

  let databaseService: DatabaseService;
  let redisService: RedisService;

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

    databaseService = moduleFixture.get(DatabaseService);
    redisService = moduleFixture.get(RedisService);

    jest.clearAllMocks();

    await redisService.flushAll();
    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET links/:linkId', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await redisService.flushAll();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
      await databaseService.file.deleteMany();
      await databaseService.link.deleteMany();
    });

    it('should return 404 for non-existent link', async () => {
      const response = await request(app.getHttpServer()).get(
        '/links/non-existent-link-id',
      );

      expect(response.status).toBe(404);
    });

    it('should get link details successfully', async () => {
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
          name: 'Test file',
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
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

      const response = await request(app.getHttpServer()).get(
        `/links/${link.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('description', 'Test link');
      expect(response.body).toHaveProperty('fileCreator', 'Test User');
    });
  });

  describe('POST /links/:linkId', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await redisService.flushAll();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
      await databaseService.file.deleteMany();
      await databaseService.link.deleteMany();
    });

    it('should return 404 for non-existent link', async () => {
      const response = await request(app.getHttpServer())
        .post('/links/non-existent-link-id')
        .send({});

      expect(response.status).toBe(404);
    });

    it('should return 401 for password-protected link without password', async () => {
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
          name: 'Test file',
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const link = await databaseService.link.create({
        data: {
          id: 'test-link-id',
          fileId: file.id,
          password: 'hashed-password',
          description: 'Test link',
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/links/${link.id}`)
        .send({});

      expect(response.status).toBe(401);
    });

    it('should get file URL successfully', async () => {
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
          name: 'Test file',
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
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

      mockS3Service.generatePresignedGetUrl.mockResolvedValue({
        success: true,
        data: 'https://test-s3-url.com/file',
      });

      const response = await request(app.getHttpServer())
        .post(`/links/${link.id}`)
        .send({});

      expect(response.status).toBe(302);
      expect(mockS3Service.generatePresignedGetUrl).toHaveBeenCalled();
    });
  });
});
