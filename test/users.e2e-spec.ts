import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Logger,
  ValidationPipe,
  INestApplication,
  BadRequestException,
} from '@nestjs/common';

import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import cookieParser from 'cookie-parser';
import { ValidationError } from 'class-validator';
import { DatabaseService } from '../src/core/database/database.service';
import { PrismaClientKnownRequestFilterFilter } from '../src/common/filters/prisma-client-known-request.filter';
import { PrismaClientUnknownRequestFilterFilter } from '../src/common/filters/prisma-client-unknown-request.filter';
import { RedisService } from '../src/core/redis/redis.service';
import { makeUserKey } from '../src/common/utils';

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
  verifyAsync: jest.fn(),
};

const testEmail = 'test@example.com';

describe('UsersController (e2e)', () => {
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
      .compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());

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

    await app.init();

    databaseService = moduleFixture.get(DatabaseService);
    redisService = moduleFixture.get(RedisService);

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/me (GET)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should get the logged in users info', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body.name).toBe('Test User');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');

      await redisService.delete(makeUserKey(userId.id));
    });

    it('should get the logged in users info and include their subscription', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
          subscriptions: {
            create: {
              plan: 'PRO',
              current_period_end: new Date(),
              current_period_start: new Date(),
              cancel_at_period_end: false,
              status: 'ACTIVE',
              started_at: new Date(),
              provider_customer_id: 'test-customer-id',
              amount: 2,
              provider_subscription_id: 'test-subscription-id',
              provider: 'POLAR',
              product_id: 'test-product-id',
              currency: 'usd',
              last_event_at: new Date(),
            },
          },
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body.name).toBe('Test User');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
      expect(response.body).toHaveProperty('subscription');
      expect(response.body.subscription).toHaveProperty('plan');
      expect(response.body.subscription.plan).toBe('PRO');

      await redisService.delete(makeUserKey(userId.id));
    });
  });

  describe('/me (PATCH)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should not update user info if not signed in', async () => {
      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(401);
    });

    it('should update user info successfully', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'Updated Name' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });

      const updatedUser = await databaseService.user.findUnique({
        where: { id: userId.id },
        select: { name: true },
      });

      expect(updatedUser?.name).toBe('Updated Name');
    });

    it('should clear cache after updating user info', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'Updated Name' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);

      const cachedUser = await redisService.get(makeUserKey(userId.id));
      expect(cachedUser.success).toBe(true);
      expect(cachedUser.data).toBeNull();
    });
  });

  describe('/me (DELETE)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should not delete user if not signed in', async () => {
      const response = await request(app.getHttpServer()).delete('/users/me');

      expect(response.status).toBe(401);
    });

    it('should delete user successfully', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });

      const deletedUser = await databaseService.user.findUnique({
        where: { id: userId.id },
      });

      expect(deletedUser).toBeNull();
    });

    it('should clear cache after deleting user', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);

      const cachedUser = await redisService.get(makeUserKey(userId.id));
      expect(cachedUser.success).toBe(true);
      expect(cachedUser.data).toBeNull();
    });

    it('should clear auth cookies after deleting user', async () => {
      const userId = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: userId.id,
      });

      const response = await request(app.getHttpServer())
        .delete('/users/me')
        .set('Cookie', [
          'access_token=test-token',
          'refresh_token=test-refresh',
        ]);

      expect(response.status).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();

      const setCookies = response.headers['set-cookie'] as string[] | string;
      const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
      expect(
        cookieArray.some((cookie) => cookie.includes('access_token=;')),
      ).toBe(true);
      expect(
        cookieArray.some((cookie) => cookie.includes('refresh_token=;')),
      ).toBe(true);
    });
  });
});
