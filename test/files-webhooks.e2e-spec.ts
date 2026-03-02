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
import { createHmac } from 'node:crypto';

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

    app = moduleFixture.createNestApplication({ rawBody: true });

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
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:invalid',
        data: {
          key: file.s3Key,
          infected: false,
        },
        timestamp: new Date(),
      };

      const signature = createHmac('sha256', process.env.FILES_WEBHOOKS_SECRET!)
        .update(JSON.stringify(body))
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', signature);

      expect(response.status).toBe(400);
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
          userId: user.id,
          contentType: 'text/plain',
          name: 'Test file',
          s3Key: 'test-key',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:validated',
        data: {
          key: file.s3Key,
          infected: false,
        },
        timestamp: new Date(),
      };

      const signature = createHmac('sha256', process.env.FILES_WEBHOOKS_SECRET!)
        .update(JSON.stringify(body))
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', signature);

      expect(response.status).toBe(201);

      const updatedFile = await databaseService.file.findUnique({
        where: {
          id: file.id,
        },
      });

      expect(file.status).toBe('pending');

      expect(updatedFile?.status).toBe('safe');
    });

    it('should ignore an old event', async () => {
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
          contentType: 'text/plain',
          name: 'Test file',
          s3Key: 'test-key',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
          lastEventAt: new Date(),
        },
      });

      const body = {
        type: 'file:validated',
        data: {
          key: file.s3Key,
          infected: false,
        },
        timestamp: new Date(100),
      };

      const signature = createHmac('sha256', process.env.FILES_WEBHOOKS_SECRET!)
        .update(JSON.stringify(body))
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', signature);

      expect(response.status).toBe(201);

      const updatedFile = await databaseService.file.findUnique({
        where: {
          id: file.id,
        },
      });

      expect(updatedFile?.lastEventAt).toEqual(file.lastEventAt);
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
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:deleted',
        data: {
          keys: [file.s3Key],
          deletedAt: new Date(),
        },
        timestamp: new Date(),
      };

      const signature = createHmac('sha256', process.env.FILES_WEBHOOKS_SECRET!)
        .update(JSON.stringify(body))
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', signature);

      expect(response.status).toBe(201);

      const updatedFile = await databaseService.file.findUnique({
        where: {
          id: file.id,
        },
      });

      expect(file.deletedAt).toBe(null);

      expect(updatedFile?.deletedAt).toEqual(body.data.deletedAt);
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
          userId: user.id,
          s3Key: 'test-key',
          contentType: 'text/plain',
          size: 100,
          description: 'Test file',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const body = {
        type: 'file:deleted',
        data: {
          invalid: [file.s3Key],
          deletedAt: new Date(),
        },
        timestamp: new Date(),
      };

      const signature = createHmac('sha256', process.env.FILES_WEBHOOKS_SECRET!)
        .update(JSON.stringify(body))
        .digest('hex');

      const response = await request(app.getHttpServer())
        .post(`/webhooks/files`)
        .send(body)
        .set('x-signature', signature);

      expect(response.status).toBe(400);
    });
  });
});
