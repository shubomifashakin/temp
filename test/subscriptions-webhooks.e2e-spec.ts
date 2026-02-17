import request from 'supertest';
import { App } from 'supertest/types';

import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';

import cookieParser from 'cookie-parser';

import { Test, TestingModule } from '@nestjs/testing';

//FIXME: POLAR_PRO_PRODUC_ENV
const testPolarProductId = 'test-polar-product-id';
process.env.POLAR_PRODUCT_PRO = 'test-polar-product-id';

import {
  ValidationPipe,
  INestApplication,
  BadRequestException,
} from '@nestjs/common';

import { AppModule } from '../src/app.module';

import { ValidationError } from 'class-validator';

import { DatabaseService } from '../src/core/database/database.service';
import { PolarService } from '../src/core/polar/polar.service';
import { EventType } from '@polar-sh/sdk/models/operations/webhookslistwebhookdeliveries';
import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import { PrismaClientKnownRequestFilterFilter } from '../src/common/filters/prisma-client-known-request.filter';
import { PrismaClientUnknownRequestFilterFilter } from '../src/common/filters/prisma-client-unknown-request.filter';

const testSubscriptionId = 'test-subscription-id';

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
  validateWebhookEvent: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const testEmail = 'test@example.com';

describe('SubscriptionsWebhooksController (e2e)', () => {
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

    app.useGlobalFilters(
      new PrismaClientKnownRequestFilterFilter(),
      new PrismaClientUnknownRequestFilterFilter(),
    );
    await app.init();

    databaseService = moduleFixture.get(DatabaseService);

    jest.clearAllMocks();

    await databaseService.user.deleteMany();
    await databaseService.refreshToken.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /webhooks/subscriptions/polar', () => {
    beforeEach(async () => {
      await databaseService.user.deleteMany();
      await databaseService.refreshToken.deleteMany();
    });

    describe('subscription.active', () => {
      const data = {
        type: 'subscription.active' as EventType,
        timestamp: new Date(),
        data: {
          id: testSubscriptionId,
          recurringInterval: 'month',
          amount: 200,
          currency: 'usd',
          productId: testPolarProductId,
          customerId: 'test-customer-id',
          startedAt: new Date(),
          recurringIntervalCount: 1,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false,
        } as unknown as Subscription,
      };

      beforeEach(async () => {
        await databaseService.user.deleteMany();
        await databaseService.refreshToken.deleteMany();
      });

      it('should process the polar subscription.active event ', async () => {
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            ...data,
            timestamp: new Date(),
            data: {
              ...data.data,
              metadata: {
                userId: user.id,
              },
            },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('ACTIVE');
      });

      it('should not process the polar subscription.active event because its old ', async () => {
        const lastEventAt = new Date();
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
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            ...data,
            timestamp: new Date(100),
            data: {
              ...data.data,
              metadata: {
                userId: user.id,
              },
            },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.last_event_at).toEqual(lastEventAt);
      });
    });

    describe('subscription.canceled', () => {
      const data = {
        type: 'subscription.canceled' as EventType,
        timestamp: new Date(Date.now() * 5),
        data: {
          id: testSubscriptionId,
          recurringInterval: 'month',
          amount: 200,
          currency: 'usd',
          productId: testPolarProductId,
          customerId: 'test-customer-id',
          startedAt: new Date(),
          recurringIntervalCount: 1,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
        } as unknown as Subscription,
      };

      beforeEach(async () => {
        await databaseService.user.deleteMany();
        await databaseService.refreshToken.deleteMany();
      });

      it('should process the polar subscription.canceled event ', async () => {
        const lastEventAt = new Date();
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
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            ...data,
            timestamp: new Date(Date.now() * 5),
            data: { ...data.data, metadata: { userId: user.id } },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancel_at_period_end).toBe(true);
      });

      it('should not process the polar subscription.canceled event because its old ', async () => {
        const lastEventAt = new Date();
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
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            ...data,
            timestamp: new Date(100),
            data: { ...data.data, metadata: { userId: user.id } },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancel_at_period_end).toBe(false);
      });
    });

    describe('subscription.uncanceled', () => {
      beforeEach(async () => {
        await databaseService.user.deleteMany();
        await databaseService.refreshToken.deleteMany();
      });

      it('should not process the polar subscription.uncanceled event because its old ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'PRO',
                current_period_end: new Date(),
                current_period_start: new Date(),
                cancel_at_period_end: true,
                cancelled_at: new Date(),
                status: 'ACTIVE',
                started_at: new Date(),
                provider_customer_id: 'test-customer-id',
                amount: 2,
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'subscription.uncanceled' as EventType,
            timestamp: new Date(100),
            data: {
              id: testSubscriptionId,
              recurringInterval: 'month',
              amount: 200,
              currency: 'usd',
              productId: testPolarProductId,
              customerId: 'test-customer-id',
              metadata: {
                userId: user.id,
              },
              startedAt: new Date(),
              recurringIntervalCount: 1,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
            } as unknown as Subscription,
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancel_at_period_end).toBe(true);
      });

      it('should process the polar subscription.uncanceled event ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'PRO',
                current_period_end: new Date(),
                current_period_start: new Date(),
                cancel_at_period_end: true,
                cancelled_at: new Date(),
                status: 'ACTIVE',
                started_at: new Date(),
                provider_customer_id: 'test-customer-id',
                amount: 2,
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'subscription.uncanceled' as EventType,
            timestamp: new Date(),
            data: {
              id: testSubscriptionId,
              recurringInterval: 'month',
              amount: 200,
              currency: 'usd',
              productId: testPolarProductId,
              customerId: 'test-customer-id',
              metadata: {
                userId: user.id,
              },
              startedAt: new Date(),
              recurringIntervalCount: 1,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
            } as unknown as Subscription,
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancel_at_period_end).toBe(false);
      });
    });

    describe('subscription.revoked', () => {
      beforeEach(async () => {
        await databaseService.user.deleteMany();
        await databaseService.refreshToken.deleteMany();
      });

      it('should not process the polar subscription.revoked event because its old ', async () => {
        const lastEventAt = new Date();
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
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'subscription.revoked' as EventType,
            timestamp: new Date(100),
            data: {
              id: testSubscriptionId,
              recurringInterval: 'month',
              amount: 200,
              currency: 'usd',
              productId: testPolarProductId,
              customerId: 'test-customer-id',
              metadata: {
                userId: user.id,
              },
              startedAt: new Date(),
              recurringIntervalCount: 1,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
            } as unknown as Subscription,
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('ACTIVE');
      });

      it('should process the polar subscription.revoked event', async () => {
        const lastEventAt = new Date();
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
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'subscription.revoked' as EventType,
            timestamp: new Date(),
            data: {
              id: testSubscriptionId,
              recurringInterval: 'month',
              amount: 200,
              currency: 'usd',
              productId: testPolarProductId,
              customerId: 'test-customer-id',
              metadata: {
                userId: user.id,
              },
              startedAt: new Date(),
              recurringIntervalCount: 1,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(),
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
            } as unknown as Subscription,
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('INACTIVE');
      });
    });

    describe('order.created', () => {
      const data = {
        currency: 'usd',
        status: 'paid',
        billingReason: 'subscription_cycle',
        subscription: {
          id: testSubscriptionId,
          recurringInterval: 'month',
          amount: 200,
          currency: 'usd',
          productId: testPolarProductId,
          customerId: 'test-customer-id',
          startedAt: new Date(),
          recurringIntervalCount: 1,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: true,
          canceledAt: null,
        },
      } as unknown as Pick<
        Order,
        'subscription' | 'currency' | 'billingReason' | 'status'
      >;

      beforeEach(async () => {
        await databaseService.user.deleteMany();
        await databaseService.refreshToken.deleteMany();
      });

      it('should not process the polar order.created event because its old ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'PRO',
                current_period_end: new Date(),
                current_period_start: new Date(),
                cancel_at_period_end: true,
                cancelled_at: new Date(),
                status: 'ACTIVE',
                started_at: new Date(),
                provider_customer_id: 'test-customer-id',
                amount: 2,
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'order.created' as EventType,
            timestamp: new Date(100),
            data: {
              ...data,
              subscription: {
                ...data.subscription,
                metadata: {
                  userId: user.id,
                },
              },
            },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('ACTIVE');
      });

      it('should process the polar order.created event ', async () => {
        const lastEventAt = new Date(100);
        const currentPeriodStart = new Date();
        const currentPeriodEnd = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'PRO',
                current_period_end: currentPeriodEnd,
                current_period_start: currentPeriodStart,
                cancel_at_period_end: true,
                cancelled_at: new Date(),
                status: 'INACTIVE',
                started_at: new Date(),
                provider_customer_id: 'test-customer-id',
                amount: 2,
                provider_subscription_id: testSubscriptionId,
                provider: 'POLAR',
                product_id: 'test-product-id',
                currency: 'usd',
                last_event_at: lastEventAt,
              },
            },
          },
        });

        const newCurrentPeriodStart = new Date(Date.now() + 1000);
        const newCurrentPeriodEnd = new Date(Date.now() + 2000);

        mockPolarService.validateWebhookEvent.mockReturnValue({
          success: true,
          error: null,
          data: {
            type: 'order.created' as EventType,
            timestamp: new Date(),
            data: {
              ...data,
              subscription: {
                ...data.subscription,
                currentPeriodStart: newCurrentPeriodStart,
                currentPeriodEnd: newCurrentPeriodEnd,
                metadata: {
                  userId: user.id,
                },
              },
            },
          },
        });

        const response = await request(app.getHttpServer()).post(
          '/webhooks/subscriptions/polar',
        );

        expect(response.status).toBe(201);
        expect(response.body).toEqual({ message: 'success' });

        const subscription = await databaseService.subscription.findFirst({
          where: {
            provider_subscription_id: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toEqual('ACTIVE');
      });
    });
  });
});
