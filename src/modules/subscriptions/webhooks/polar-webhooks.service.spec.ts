import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarService } from '../../../core/polar/polar.service';
import { DatabaseService } from '../../../core/database/database.service';

import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';

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
      last_event_at: new Date(),
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
        provider_subscription_id: mockSubscription.id,
      },
      create: {
        user_id: 'test-user-id',
        provider: 'POLAR',
        plan: testPlan,
        status: 'INACTIVE',
        amount: mockSubscription.amount,
        currency: mockSubscription.currency,
        interval: testInterval,
        product_id: mockSubscription.productId,
        provider_subscription_id: mockSubscription.id,
        provider_customer_id: mockSubscription.customerId,
        interval_count: mockSubscription.recurringIntervalCount,
        started_at: mockSubscription.startedAt,
        current_period_start: mockSubscription.currentPeriodStart,
        current_period_end: mockSubscription.currentPeriodEnd
          ? new Date(mockSubscription.currentPeriodEnd)
          : null,
        cancel_at_period_end: mockSubscription.cancelAtPeriodEnd || false,
        ended_at: mockSubscription.endedAt,
        last_event_at: timestamp,
      },
      update: {
        status: 'INACTIVE',
        provider: 'POLAR',
        product_id: mockSubscription.productId,
        ended_at: mockSubscription.endedAt,
        last_event_at: timestamp,
      },
    });
  });

  it('should not process the revoke event because its old', async () => {
    mockDatabaseService.subscription.findUnique.mockResolvedValue({
      last_event_at: new Date(),
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
        provider_subscription_id: mockSubscription.id,
      },
      create: {
        status: 'ACTIVE',
        provider: 'POLAR',
        plan: testPlan,
        amount: mockSubscription.amount,
        currency: mockSubscription.currency,
        product_id: mockSubscription.productId,
        interval: testInterval,
        provider_subscription_id: mockSubscription.id,
        provider_customer_id: mockSubscription.customerId,
        user_id: 'test-user-id',
        started_at: mockSubscription.startedAt,
        interval_count: mockSubscription.recurringIntervalCount,
        current_period_start: mockSubscription.currentPeriodStart,
        current_period_end: mockSubscription.currentPeriodEnd
          ? new Date(mockSubscription.currentPeriodEnd)
          : null,
        cancel_at_period_end: mockSubscription.cancelAtPeriodEnd || false,
        last_event_at: timestamp,
      },
      update: {
        status: 'ACTIVE',
        provider: 'POLAR',
        plan: testPlan,
        amount: mockSubscription.amount,
        currency: mockSubscription.currency,
        product_id: mockSubscription.productId,
        interval: testInterval,
        current_period_end: mockSubscription.currentPeriodEnd,
        interval_count: mockSubscription.recurringIntervalCount,
        cancel_at_period_end: mockSubscription.cancelAtPeriodEnd,
        current_period_start: mockSubscription.currentPeriodStart,
        last_event_at: timestamp,
      },
    });
  });

  it('should not process the active event because its old', async () => {
    mockDatabaseService.subscription.findUnique.mockResolvedValue({
      last_event_at: new Date(),
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
        provider_subscription_id: mockSubscription.subscription!.id,
      },
      data: {
        status: 'ACTIVE',
        plan: testPlan,
        interval: testInterval,
        currency: mockSubscription.currency,
        product_id: mockSubscription.subscription!.productId,
        interval_count: mockSubscription.subscription!.recurringIntervalCount,
        cancel_at_period_end: mockSubscription.subscription!.cancelAtPeriodEnd,
        amount: mockSubscription.subscription!.amount,
        current_period_start: mockSubscription.subscription!.currentPeriodStart,
        current_period_end: mockSubscription.subscription!.currentPeriodEnd
          ? new Date(mockSubscription.subscription!.currentPeriodEnd)
          : null,
        last_event_at: timestamp,
      },
    });
  });
});
