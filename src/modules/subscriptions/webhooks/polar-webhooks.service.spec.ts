import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarService } from '../../../core/polar/polar.service';
import { DatabaseService } from '../../../core/database/database.service';

import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import { AppConfigService } from '../../../core/app-config/app-config.service';

const testProductId = 'test-product-id';

const mockPolarService = {
  polarProductIdToPlan: jest.fn(),
};

const mockDatabaseService = {
  subscription: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

const mockAppConfigService = {
  PolarWebhookSecret: {
    data: 'polar-webhook-secret',
  },
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('polar-webhook-secret'),
};

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const testInterval = 'day';
const testPlan = 'test-plan';

describe('PolarWebhooksService', () => {
  let service: PolarWebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolarWebhooksService,
        { useValue: mockDatabaseService, provide: DatabaseService },
        { useValue: mockConfigService, provide: ConfigService },
        { useValue: mockPolarService, provide: PolarService },
        { useValue: mockAppConfigService, provide: AppConfigService },
      ],
    }).compile();

    service = module.get<PolarWebhooksService>(PolarWebhooksService);

    module.useLogger(mockLogger);

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

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

    const res = await service.handleEvent(
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

    const res = await service.handleEvent(
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

    const res = await service.handleEvent(
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
        provider: 'POLAR',
        plan: testPlan,
        status: 'INACTIVE',
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
        status: 'INACTIVE',
        provider: 'POLAR',
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

    const res = await service.handleEvent(
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

    const res = await service.handleEvent(
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
        status: 'ACTIVE',
        provider: 'POLAR',
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
        status: 'ACTIVE',
        provider: 'POLAR',
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

    const res = await service.handleEvent(
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

    const res = await service.handleEvent(
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

    const res = await service.handleEvent(
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
        status: 'ACTIVE',
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
