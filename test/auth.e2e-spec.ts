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

import { makeOauthStateKey } from '../src/common/utils';
import { RedisService } from '../src/core/redis/redis.service';
import { DatabaseService } from '../src/core/database/database.service';

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
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const testEmail = 'test@example.com';

describe('AuthController (e2e)', () => {
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
  });

  describe('GET /auth/google', () => {
    it('should redirect to google authorization page', async () => {
      const response = await request(app.getHttpServer()).get('/auth/google');

      expect(response.status).toBe(302);
      expect(response.redirect).toBe(true);
    });
  });

  describe('GET /auth/google/callback', () => {
    it('should return 401 if state is invalid', async () => {
      const response = await request(app.getHttpServer()).get(
        '/auth/google/callback?state=invalid&code=invalid',
      );

      expect(response.status).toBe(401);
    });

    it('should return 200 if state is valid', async () => {
      const testState = 'test-uuid';
      await redisService.set(makeOauthStateKey(testState), {
        timestamp: Date.now(),
      });

      const testCode = 'test-code';

      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          scope: 'test-scope',
          id_token: 'test-id-token',
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
        ok: true,
      });

      mockJwtService.decode.mockReturnValue({
        email: testEmail,
        sub: 'test-sub',
        name: 'test-name',
        picture: 'test-picture',
        iss: 'test-iss',
        auth_time: 'test-auth-time',
      });

      mockJwtService.signAsync
        .mockResolvedValueOnce('test-access-token')
        .mockResolvedValueOnce('test-refresh-token');

      const response = await request(app.getHttpServer()).get(
        `/auth/google/callback?state=${testState}&code=${testCode}`,
      );

      expect(response.status).toBe(302);
      expect(response.redirect).toBe(true);
    });
  });

  describe('GET /auth/logout', () => {
    it('should return 200 if user is not signed in', async () => {
      const response = await request(app.getHttpServer()).post('/auth/logout');

      expect(response.status).toBe(200);
    });

    it('should successfully sign out the user', async () => {
      const testAccessTokenId = 'test-access-token-id';
      const testRefreshTokenId = 'test-refresh-token-id';

      mockJwtService.decode
        .mockReturnValueOnce({
          jti: testAccessTokenId,
        })
        .mockReturnValueOnce({
          jti: testRefreshTokenId,
        });

      await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'test-name',
          picture: 'test-picture',
        },
      });

      await databaseService.refreshToken.create({
        data: {
          tokenId: testRefreshTokenId,
          userId: 'test-user-id',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/auth/logout`)
        .set('Cookie', [
          'access_token=test-access-token',
          'refresh_token=test-refresh-token',
        ]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return 401 if user is not signed in', async () => {
      const response = await request(app.getHttpServer()).post('/auth/refresh');
      expect(response.status).toBe(401);
    });

    it('should successfully refresh the user', async () => {
      const testRefreshTokenId = 'test-refresh-token-id';

      mockJwtService.decode.mockReturnValue({
        jti: testRefreshTokenId,
      });

      await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'test-name',
          picture: 'test-picture',
        },
      });

      await databaseService.refreshToken.create({
        data: {
          tokenId: testRefreshTokenId,
          userId: 'test-user-id',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      mockJwtService.signAsync.mockResolvedValue('test-access-token');

      const response = await request(app.getHttpServer())
        .post(`/auth/refresh`)
        .set('Cookie', ['refresh_token=test-refresh-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should not refresh the user if refresh token has expired', async () => {
      const testRefreshTokenId = 'test-refresh-token-id';

      mockJwtService.decode.mockReturnValue({
        jti: testRefreshTokenId,
      });

      await databaseService.user.create({
        data: {
          id: 'test-user-id',
          email: testEmail,
          name: 'test-name',
          picture: 'test-picture',
        },
      });

      await databaseService.refreshToken.create({
        data: {
          tokenId: testRefreshTokenId,
          userId: 'test-user-id',
          expiresAt: new Date(100),
        },
      });

      mockJwtService.signAsync.mockResolvedValue('test-access-token');

      const response = await request(app.getHttpServer())
        .post(`/auth/refresh`)
        .set('Cookie', ['refresh_token=test-refresh-token']);

      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).not.toBeDefined();
    });
  });
});
