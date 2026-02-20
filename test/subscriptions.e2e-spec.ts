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

import { DatabaseService } from '../src/core/database/database.service';
import { PolarService } from '../src/core/polar/polar.service';
import { BillingInterval, Plan } from '../generated/prisma/enums';

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

const mockPolarService = {
  cancelSubscription: jest.fn(),
  getAvailableProducts: jest.fn(),
  getProduct: jest.fn(),
  createCheckout: jest.fn(),
  polarProductIdToPlan: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const testEmail = 'test@example.com';

describe('SubscriptionsController (e2e)', () => {
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
      .overrideProvider(PolarService)
      .useValue(mockPolarService)
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

    databaseService = moduleFixture.get(DatabaseService);

    jest.clearAllMocks();

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();

    mockPolarService.polarProductIdToPlan.mockReturnValue({
      success: true,
      data: {
        plan: Plan.PRO,
        benefits: ['test-benefit'],
        interval: BillingInterval.MONTH,
      },
      error: null,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('DELETE /subscriptions/current', () => {
    beforeEach(async () => {
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should cancel the users active subscription', async () => {
      const user = await databaseService.user.create({
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

      mockPolarService.cancelSubscription.mockResolvedValue({
        success: true,
        error: null,
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .delete('/subscriptions/current')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'success' });

      const subscriptionInfo = await databaseService.subscription.findFirst({
        where: {
          user_id: user.id,
        },
      });

      expect(subscriptionInfo?.cancel_at_period_end).toBe(true);
    });

    it('should not cancel subscription if unauthenticated', async () => {
      const response = await request(app.getHttpServer())
        .delete('/subscriptions/current')
        .set('Cookie', []);

      expect(response.status).toBe(401);
    });

    it('should not cancel the subscription because polar failed', async () => {
      const user = await databaseService.user.create({
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

      mockPolarService.cancelSubscription.mockResolvedValue({
        success: false,
        error: new Error('polar failed to cancel'),
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .delete('/subscriptions/current')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /subscriptions/plans', () => {
    beforeEach(async () => {
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should get plans successfully', async () => {
      mockPolarService.getAvailableProducts.mockResolvedValue({
        success: true,
        data: {
          result: {
            items: [
              {
                id: 'test-product-id',
                isRecurring: true,
                recurringInterval: 'month',
                prices: [
                  {
                    amountType: 'fixed',
                    priceAmount: 500,
                    priceCurrency: 'usd',
                  },
                ],
              },
            ],
            pagination: {
              maxPage: 1,
            },
          },
        },
        error: null,
      });

      const user = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('month');
      expect(response.body.data.month).toHaveLength(1);
      expect(response.body.data).toHaveProperty('year');
      expect(response.body.data.year).toHaveLength(0);
    });

    it('should handle polar service failure', async () => {
      mockPolarService.getAvailableProducts.mockResolvedValue({
        success: false,
        data: null,
        error: new Error('Polar API failed'),
      });

      const user = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(500);
    });

    it('should not get plans if user is not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/subscriptions/plans')
        .set('Cookie', []);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /subscriptions/checkout', () => {
    beforeEach(async () => {
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    it('should create polar checkout successfully', async () => {
      const user = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockPolarService.getProduct.mockResolvedValue({
        success: true,
        data: { id: 'test-product-id' },
        error: null,
      });

      mockPolarService.createCheckout.mockResolvedValue({
        success: true,
        data: { url: 'https://checkout.polar.test/session' },
        error: null,
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .post('/subscriptions/checkout')
        .send({ product_id: 'test-product-id', provider: 'polar' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        'https://checkout.polar.test/session',
      );
    });

    it('should not create checkout if user has active subscription', async () => {
      const user = await databaseService.user.create({
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
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .post('/subscriptions/checkout')
        .send({ product_id: 'test-product-id', provider: 'polar' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create checkout if product does not exist', async () => {
      const user = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockPolarService.getProduct.mockResolvedValue({
        success: true,
        data: null,
        error: null,
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .post('/subscriptions/checkout')
        .send({ product_id: 'non-existent-product', provider: 'polar' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create checkout if polar service fails', async () => {
      const user = await databaseService.user.create({
        data: {
          email: testEmail,
          name: 'Test User',
        },
      });

      mockPolarService.getProduct.mockResolvedValue({
        success: true,
        data: { id: 'test-product-id' },
        error: null,
      });

      mockPolarService.createCheckout.mockResolvedValue({
        success: false,
        data: null,
        error: new Error('Polar checkout failed'),
      });

      mockJwtService.verifyAsync.mockResolvedValue({
        jti: 'test-jti',
        userId: user.id,
      });

      const response = await request(app.getHttpServer())
        .post('/subscriptions/checkout')
        .send({ product_id: 'test-product-id', provider: 'polar' })
        .set('Cookie', ['access_token=test-token']);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message');
    });

    it('should not create checkout if not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .post('/subscriptions/checkout')
        .send({ product_id: 'test-product-id', provider: 'polar' });

      expect(response.status).toBe(401);
    });
  });
});
