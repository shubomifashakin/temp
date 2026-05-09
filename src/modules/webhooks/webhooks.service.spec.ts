import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { RedisService } from '../../core/redis/redis.service';
import { PolarService } from '../../core/polar/polar.service';
import { DatabaseService } from '../../core/database/database.service';
import { AppConfigService } from '../../core/app-config/app-config.service';

import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';

const mockDatabaseService = {
  file: {
    deleteMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

const mockPolarService = {
  polarProductIdToPlan: jest.fn(),
};

const mockAppConfigService = {
  PolarWebhookSecret: {
    data: 'polar-webhook-secret',
  },
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('polar-webhook-secret'),
};

const testProductId = 'test-product-id';
const testInterval = 'day';
const testPlan = 'test-plan';

const mockRedisService = {
  delete: jest.fn(),
};

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        { useValue: mockAppConfigService, provide: AppConfigService },
        { useValue: mockPolarService, provide: PolarService },
        { useValue: mockConfigService, provide: ConfigService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    jest.clearAllMocks();

    mockPolarService.polarProductIdToPlan.mockReturnValue({
      success: true,
      data: {
        plan: testPlan,
        benefits: ['test-benefit'],
        interval: testInterval,
      },
      error: null,
    });
  });

  describe('File Events', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should handle file:validated event', async () => {
      mockRedisService.delete.mockResolvedValue({
        success: true,
        error: null,
      });

      mockDatabaseService.file.findFirst.mockResolvedValue({ lastEvent: null });

      mockDatabaseService.file.update.mockResolvedValue({
        id: 'test-id',
        s3Key: 'test-key',
        status: 'safe',
      });

      const timestamp = new Date();
      await service.handleFileEvents({
        data: { key: 'test-key', infected: false },
        type: 'file:validated',
        timestamp,
      });

      expect(mockDatabaseService.file.update).toHaveBeenCalledWith({
        where: {
          s3Key: 'test-key',
        },
        data: {
          status: 'safe',
          lastEventAt: timestamp,
        },
      });
    });

    it('should not handle file:validated event if the file does not exist', async () => {
      mockRedisService.delete.mockResolvedValue({
        success: true,
        error: null,
      });

      mockDatabaseService.file.findFirst.mockResolvedValue(null);

      mockDatabaseService.file.update.mockResolvedValue({
        id: 'test-id',
        s3Key: 'test-key',
        status: 'safe',
      });

      const timestamp = new Date();
      await service.handleFileEvents({
        data: { key: 'test-key', infected: false },
        type: 'file:validated',
        timestamp,
      });

      expect(mockDatabaseService.file.update).not.toHaveBeenCalled();
    });

    it('should not handle file:validated event if the event is old', async () => {
      mockRedisService.delete.mockResolvedValue({
        success: true,
        error: null,
      });

      mockDatabaseService.file.findFirst.mockResolvedValue({
        lastEventAt: new Date(),
      });

      mockDatabaseService.file.update.mockResolvedValue({
        id: 'test-id',
        s3Key: 'test-key',
        status: 'safe',
      });

      const timestamp = new Date(100);
      await service.handleFileEvents({
        data: { key: 'test-key', infected: false },
        type: 'file:validated',
        timestamp,
      });

      expect(mockDatabaseService.file.update).not.toHaveBeenCalled();
    });

    it('should handle file:deleted event', async () => {
      const dto = {
        type: 'file:deleted',
        data: {
          keys: ['test-key-1', 'test-key-2'],
          deletedAt: new Date(),
        },
      };

      mockDatabaseService.file.findMany.mockResolvedValue([]);

      const timestamp = new Date();
      await service.handleFileEvents({
        type: 'file:deleted',
        data: dto.data,
        timestamp,
      });

      expect(mockDatabaseService.file.deleteMany).toHaveBeenCalledWith({
        where: {
          s3Key: { in: ['test-key-1', 'test-key-2'] },
        },
      });
    });
  });

  describe('Polar Events', () => {
    it('should handle subscription cancelled event', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const subscriptionId = 'test-subscription-id';

      const date = new Date();
      const mockSubscription: Omit<
        Subscription,
        | 'customer'
        | 'product'
        | 'discount'
        | 'prices'
        | 'meters'
        | 'customerCancellationReason'
        | 'customerCancellationComment'
        | 'pendingUpdate'
      > = {
        id: subscriptionId,
        amount: 21,
        cancelAtPeriodEnd: true,
        canceledAt: date,
        checkoutId: 'test-checkout-id',
        createdAt: date,
        currency: 'usd',
        startedAt: date,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        status: 'active',
        modifiedAt: date,
        currentPeriodStart: date,
        currentPeriodEnd: date,
        productId: testProductId,
        customerId: 'customer-id',
        metadata: {
          userId: 'test-user-id',
        },
        endedAt: date,
        trialStart: null,
        trialEnd: null,
        endsAt: null,
        discountId: null,
      };

      const res = await service.handlePolarEvent(
        'subscription.canceled',
        mockSubscription as Subscription,
        new Date(),
      );

      expect(res.message).toBeDefined();
    });

    it('should handle not process the event since its old', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue({
        lastEventAt: new Date(),
      });

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const res = await service.handlePolarEvent(
        'subscription.canceled',
        {} as Subscription,
        new Date(100),
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).not.toHaveBeenCalled();
    });

    it('should handle the subscription revoked event', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const subscriptionId = 'test-subscription-id';

      const date = new Date();
      const mockSubscription: Omit<
        Subscription,
        | 'customer'
        | 'product'
        | 'discount'
        | 'prices'
        | 'meters'
        | 'customerCancellationReason'
        | 'customerCancellationComment'
        | 'pendingUpdate'
      > = {
        id: subscriptionId,
        amount: 21,
        cancelAtPeriodEnd: true,
        canceledAt: date,
        checkoutId: 'test-checkout-id',
        createdAt: date,
        currency: 'usd',
        startedAt: date,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        status: 'active',
        modifiedAt: date,
        currentPeriodStart: date,
        currentPeriodEnd: date,
        productId: testProductId,
        customerId: 'customer-id',
        metadata: {
          userId: 'test-user-id',
        },
        endedAt: date,
        trialStart: null,
        trialEnd: null,
        endsAt: null,
        discountId: null,
      };

      const timestamp = new Date();

      const res = await service.handlePolarEvent(
        'subscription.revoked',
        mockSubscription as Subscription,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).toHaveBeenCalledWith({
        where: {
          providerSubscriptionId: mockSubscription.id,
        },
        create: {
          userId: 'test-user-id',
          provider: 'polar',
          plan: testPlan,
          status: 'inactive',
          amount: mockSubscription.amount,
          currency: mockSubscription.currency,
          interval: testInterval,
          productId: mockSubscription.productId,
          providerSubscriptionId: mockSubscription.id,
          providerCustomerId: mockSubscription.customerId,
          intervalCount: mockSubscription.recurringIntervalCount,
          startedAt: mockSubscription.startedAt,
          currentPeriodStart: mockSubscription.currentPeriodStart,
          currentPeriodEnd: mockSubscription.currentPeriodEnd
            ? new Date(mockSubscription.currentPeriodEnd)
            : null,
          cancelAtPeriodEnd: mockSubscription.cancelAtPeriodEnd || false,
          endedAt: mockSubscription.endedAt,
          lastEventAt: timestamp,
        },
        update: {
          status: 'inactive',
          provider: 'polar',
          productId: mockSubscription.productId,
          endedAt: mockSubscription.endedAt,
          lastEventAt: timestamp,
        },
      });
    });

    it('should not process the revoke event because its old', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue({
        lastEventAt: new Date(),
      });

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const timestamp = new Date(100);

      const res = await service.handlePolarEvent(
        'subscription.revoked',
        {} as Subscription,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).not.toHaveBeenCalled();
    });

    it('should handle the subscription active event', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const subscriptionId = 'test-subscription-id';

      const date = new Date();
      const mockSubscription: Omit<
        Subscription,
        | 'customer'
        | 'product'
        | 'discount'
        | 'prices'
        | 'meters'
        | 'customerCancellationReason'
        | 'customerCancellationComment'
        | 'pendingUpdate'
      > = {
        id: subscriptionId,
        amount: 21,
        cancelAtPeriodEnd: true,
        canceledAt: date,
        checkoutId: 'test-checkout-id',
        createdAt: date,
        currency: 'usd',
        startedAt: date,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        status: 'active',
        modifiedAt: date,
        currentPeriodStart: date,
        currentPeriodEnd: date,
        productId: testProductId,
        customerId: 'customer-id',
        metadata: {
          userId: 'test-user-id',
        },
        endedAt: date,
        trialStart: null,
        trialEnd: null,
        endsAt: null,
        discountId: null,
      };

      const timestamp = new Date();

      const res = await service.handlePolarEvent(
        'subscription.active',
        mockSubscription as Subscription,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).toHaveBeenCalledWith({
        where: {
          providerSubscriptionId: mockSubscription.id,
        },
        create: {
          status: 'active',
          provider: 'polar',
          plan: testPlan,
          amount: mockSubscription.amount,
          currency: mockSubscription.currency,
          productId: mockSubscription.productId,
          interval: testInterval,
          providerSubscriptionId: mockSubscription.id,
          providerCustomerId: mockSubscription.customerId,
          userId: 'test-user-id',
          startedAt: mockSubscription.startedAt,
          intervalCount: mockSubscription.recurringIntervalCount,
          currentPeriodStart: mockSubscription.currentPeriodStart,
          currentPeriodEnd: mockSubscription.currentPeriodEnd
            ? new Date(mockSubscription.currentPeriodEnd)
            : null,
          cancelAtPeriodEnd: mockSubscription.cancelAtPeriodEnd || false,
          lastEventAt: timestamp,
        },
        update: {
          status: 'active',
          provider: 'polar',
          plan: testPlan,
          amount: mockSubscription.amount,
          currency: mockSubscription.currency,
          productId: mockSubscription.productId,
          interval: testInterval,
          currentPeriodEnd: mockSubscription.currentPeriodEnd,
          intervalCount: mockSubscription.recurringIntervalCount,
          cancelAtPeriodEnd: mockSubscription.cancelAtPeriodEnd,
          currentPeriodStart: mockSubscription.currentPeriodStart,
          lastEventAt: timestamp,
        },
      });
    });

    it('should not process the active event because its old', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue({
        lastEventAt: new Date(),
      });

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const timestamp = new Date(100);

      const res = await service.handlePolarEvent(
        'subscription.active',
        {} as Subscription,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).not.toHaveBeenCalled();
    });

    it('should handle the subscription uncancelled event', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const subscriptionId = 'test-subscription-id';

      const date = new Date();
      const mockSubscription: Omit<
        Subscription,
        | 'customer'
        | 'product'
        | 'discount'
        | 'prices'
        | 'meters'
        | 'customerCancellationReason'
        | 'customerCancellationComment'
        | 'pendingUpdate'
      > = {
        id: subscriptionId,
        amount: 21,
        cancelAtPeriodEnd: true,
        canceledAt: date,
        checkoutId: 'test-checkout-id',
        createdAt: date,
        currency: 'usd',
        startedAt: date,
        recurringInterval: 'month',
        recurringIntervalCount: 1,
        status: 'active',
        modifiedAt: date,
        currentPeriodStart: date,
        currentPeriodEnd: date,
        productId: testProductId,
        customerId: 'customer-id',
        metadata: {
          userId: 'test-user-id',
        },
        endedAt: date,
        trialStart: null,
        trialEnd: null,
        endsAt: null,
        discountId: null,
      };

      const timestamp = new Date();

      const res = await service.handlePolarEvent(
        'subscription.uncanceled',
        mockSubscription as Subscription,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.upsert).toHaveBeenCalled();
    });

    it('should handle the order created event', async () => {
      mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

      mockDatabaseService.subscription.upsert.mockResolvedValue(null);

      const subscriptionId = 'test-subscription-id';

      const date = new Date();
      const mockSubscription: Pick<
        Order,
        'subscription' | 'billingReason' | 'currency' | 'totalAmount' | 'status'
      > = {
        subscription: {
          status: 'active',
          id: subscriptionId,
          amount: 21,
          cancelAtPeriodEnd: true,
          canceledAt: date,
          checkoutId: 'test-checkout-id',
          createdAt: date,
          currency: 'usd',
          startedAt: date,
          recurringInterval: 'month',
          recurringIntervalCount: 1,
          discountId: '',
          trialEnd: date,
          trialStart: date,
          modifiedAt: date,
          currentPeriodStart: date,
          currentPeriodEnd: date,
          productId: testProductId,
          customerId: 'customer-id',
          metadata: {
            userId: 'test-user-id',
          },
          endedAt: date,
          endsAt: date,
          customerCancellationComment: '',
          customerCancellationReason: null,
        },
        status: 'paid',
        billingReason: 'subscription_cycle',
        currency: 'usd',
        totalAmount: 0,
      };

      const timestamp = new Date();

      const res = await service.handlePolarEvent(
        'order.created',
        mockSubscription as Order,
        timestamp,
      );

      expect(res.message).toBeDefined();
      expect(mockDatabaseService.subscription.update).toHaveBeenCalledWith({
        where: {
          providerSubscriptionId: mockSubscription.subscription!.id,
        },
        data: {
          status: 'active',
          plan: testPlan,
          interval: testInterval,
          currency: mockSubscription.currency,
          productId: mockSubscription.subscription!.productId,
          intervalCount: mockSubscription.subscription!.recurringIntervalCount,
          cancelAtPeriodEnd: mockSubscription.subscription!.cancelAtPeriodEnd,
          amount: mockSubscription.subscription!.amount,
          currentPeriodStart: mockSubscription.subscription!.currentPeriodStart,
          currentPeriodEnd: mockSubscription.subscription!.currentPeriodEnd
            ? new Date(mockSubscription.subscription!.currentPeriodEnd)
            : null,
          lastEventAt: timestamp,
        },
      });
    });
  });
});
