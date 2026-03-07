import request from 'supertest';
import { App } from 'supertest/types';

import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';

import cookieParser from 'cookie-parser';

import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuid } from 'uuid';

import {
  ValidationPipe,
  INestApplication,
  BadRequestException,
} from '@nestjs/common';

import { AppModule } from '../src/app.module';

import { ValidationError } from 'class-validator';

import { RedisService } from '../src/core/redis/redis.service';
import { DatabaseService } from '../src/core/database/database.service';
import { createHash } from 'node:crypto';
import { makeCliAuthCodeKey } from '../src/modules/auth/cli/common/utils';

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
};

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

const mockJwtService = {
  decode: jest.fn(),
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CliController (e2e)', () => {
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

    app.use(cookieParser());
    await app.init();

    redisService = moduleFixture.get(RedisService);

    databaseService = moduleFixture.get(DatabaseService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();
  });

  afterEach(async () => {
    await app.close();
    await redisService.flushAll();
  });

  describe('POST /auth/cli/initiate', () => {
    it('should initiate the authentication', async () => {
      const response = await request(app.getHttpServer()).post(
        '/auth/cli/initiate',
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('code');
    });
  });

  describe('POST /auth/cli/confirm', () => {
    it('should return 401 if user is not logged in', async () => {
      const response = await request(app.getHttpServer()).post(
        '/auth/cli/confirm?state=invalid&code=invalid',
      );

      expect(response.status).toBe(401);
    });

    it('should return 401 if state is invalid', async () => {
      const testState = 'test-uuid';
      const testCode = 'test-code';

      const userId = await databaseService.user.create({
        data: {
          email: 'test@email.com',
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      await redisService.set(makeCliAuthCodeKey(testCode), {
        confirmed: false,
        state: testState,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/cli/confirm?state=invalid&code=invalid')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(401);
    });

    it('should return 201 if state is valid', async () => {
      const testState = 'test-uuid';
      const testCode = 'test-code';

      const userId = await databaseService.user.create({
        data: {
          email: 'test@email.com',
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      await redisService.set(makeCliAuthCodeKey(testCode), {
        confirmed: false,
        state: testState,
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/cli/confirm?state=${testState}&code=${testCode}`)
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/cli/logout', () => {
    it('should return 401 if user is not logged in', async () => {
      const response = await request(app.getHttpServer()).post(
        '/auth/cli/logout',
      );

      expect(response.status).toBe(401);
    });

    it('should return 201 if state is valid', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: 'test@email.com',
          name: 'Test User',
        },
      });

      const token = uuid();

      const hashedToken = createHash('sha256').update(token).digest('hex');

      await databaseService.personalAccessTokens.create({
        data: {
          token: hashedToken,
          userId: userId.id,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/cli/logout`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/cli/token', () => {
    it('should successfully create the token', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: 'test@email.com',
          name: 'Test User',
        },
      });

      await redisService.set(makeCliAuthCodeKey('test-code'), {
        userId: userId.id,
        confirmed: true,
      });

      const response = await request(app.getHttpServer()).post(
        `/auth/cli/token?code=test-code`,
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
    });
  });
});
