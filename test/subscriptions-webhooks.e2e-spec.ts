import request from 'supertest';
import { App } from 'supertest/types';

import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';

import cookieParser from 'cookie-parser';

import { Test, TestingModule } from '@nestjs/testing';

const testPolarProductId = 'test-polar-product-id';

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
import { BillingInterval, Plan } from '../generated/prisma/enums';

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
  polarProductIdToPlan: jest.fn(),
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

    mockPolarService.polarProductIdToPlan.mockReturnValue({
      success: true,
      data: {
        plan: Plan.pro,
        benefits: ['test-benefit'],
        interval: BillingInterval.month,
      },
      error: null,
    });
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('active');
      });

      it('should not process the polar subscription.active event because its old ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: false,
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.lastEventAt).toEqual(lastEventAt);
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
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: false,
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancelAtPeriodEnd).toBe(true);
      });

      it('should not process the polar subscription.canceled event because its old ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: false,
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancelAtPeriodEnd).toBe(false);
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
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: true,
                cancelledAt: new Date(),
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancelAtPeriodEnd).toBe(true);
      });

      it('should process the polar subscription.uncanceled event ', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: true,
                cancelledAt: new Date(),
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.cancelAtPeriodEnd).toBe(false);
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
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: false,
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('active');
      });

      it('should process the polar subscription.revoked event', async () => {
        const lastEventAt = new Date();
        const user = await databaseService.user.create({
          data: {
            email: testEmail,
            name: 'Test User',
            subscriptions: {
              create: {
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: false,
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('inactive');
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
                plan: 'pro',
                currentPeriodEnd: new Date(),
                currentPeriodStart: new Date(),
                cancelAtPeriodEnd: true,
                cancelledAt: new Date(),
                status: 'active',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toBe('active');
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
                plan: 'pro',
                currentPeriodEnd: currentPeriodEnd,
                currentPeriodStart: currentPeriodStart,
                cancelAtPeriodEnd: true,
                cancelledAt: new Date(),
                status: 'inactive',
                startedAt: new Date(),
                providerCustomerId: 'test-customer-id',
                amount: 2,
                providerSubscriptionId: testSubscriptionId,
                provider: 'polar',
                productId: 'test-product-id',
                currency: 'usd',
                lastEventAt: lastEventAt,
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
            providerSubscriptionId: testSubscriptionId,
          },
        });

        expect(subscription).toBeDefined();
        expect(subscription?.status).toEqual('active');
      });
    });
  });
});
