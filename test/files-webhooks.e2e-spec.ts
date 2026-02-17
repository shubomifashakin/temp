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
import { DatabaseService } from '../src/core/database/database.service';
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

describe('FilesWebhooksController (e2e)', () => {
  let app: INestApplication<App>;

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

    databaseService = moduleFixture.get(DatabaseService);

    jest.clearAllMocks();

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /webhooks/files', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
      await databaseService.file.deleteMany();
      await databaseService.link.deleteMany();
    });

    it('should return 401 for missing signature', async () => {
      const response = await request(app.getHttpServer()).post(
        '/webhooks/files',
      );

      expect(response.status).toBe(401);
    });

    it('should return 200 for validated file', async () => {
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
          name: 'Test file',
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:validated',
        data: {
          key: file.s3_key,
          infected: false,
        },
      };

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', process.env.FILES_WEBHOOKS_SECRET!);

      expect(response.status).toBe(201);

      const updatedFile = await databaseService.file.findUnique({
        where: {
          id: file.id,
        },
      });

      expect(file.status).toBe('pending');

      expect(updatedFile?.status).toBe('safe');
    });

    it('should return 400 for invalid event', async () => {
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
          user_id: user.id,
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:invalid',
        data: {
          key: file.s3_key,
          infected: false,
        },
      };

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', process.env.FILES_WEBHOOKS_SECRET!);

      expect(response.status).toBe(400);
    });

    it('should return 200 for deleted file', async () => {
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
          user_id: user.id,
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:deleted',
        data: {
          keys: [file.s3_key],
          deleted_at: new Date(),
        },
      };

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', process.env.FILES_WEBHOOKS_SECRET!);

      expect(response.status).toBe(201);

      const updatedFile = await databaseService.file.findUnique({
        where: {
          id: file.id,
        },
      });

      expect(file.deleted_at).toBe(null);

      expect(updatedFile?.deleted_at).toEqual(body.data.deleted_at);
    });

    it('should return 400 for invalid deleted file event', async () => {
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
          user_id: user.id,
          s3_key: 'test-key',
          size: 100,
          description: 'Test file',
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:deleted',
        data: {
          invalid: [file.s3_key],
          deleted_at: new Date(),
        },
      };

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', process.env.FILES_WEBHOOKS_SECRET!);

      expect(response.status).toBe(400);
    });
  });
});
