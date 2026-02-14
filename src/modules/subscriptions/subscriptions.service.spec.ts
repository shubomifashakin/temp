import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

//FIXME: MAKE IT A SERVICE
process.env.POLAR_PRODUCT_PRO = 'test-value';

import { PolarService } from '../../core/polar/polar.service';
import { DatabaseService } from '../../core/database/database.service';
import {
  SubscriptionStatus,
  SubscriptionProvider,
} from '../../../generated/prisma/enums';

const mockDatabaseService = {
  subscription: {
    findUnique: jest.fn(),
  },
  user: {
    findUniqueOrThrow: jest.fn(),
  },
};

const mockPolarService = {
  getAvailableProducts: jest.fn(),
  cancelSubscription: jest.fn(),
  getProduct: jest.fn(),
  createCheckout: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('test-value'),
  get: jest.fn().mockReturnValue('test-value'),
};

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { useValue: mockPolarService, provide: PolarService },
        { useValue: mockConfigService, provide: ConfigService },
        { useValue: mockDatabaseService, provide: DatabaseService },
      ],
      imports: [],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);

    module.useLogger(mockLogger);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should cancel the subscription', async () => {
    const testUserId = 'test-user-id';
    const subId = 'test-sub-id';

    mockDatabaseService.subscription.findUnique.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      provider: SubscriptionProvider.POLAR,
      provider_subscription_id: subId,
    });

    mockPolarService.cancelSubscription.mockResolvedValue({
      success: true,
      error: false,
    });

    const response = await service.cancelSubscription(testUserId);

    expect(response.message).toBeDefined();
  });

  it('should not cancel an non-existent subscription', async () => {
    const testUserId = 'test-user-id';

    mockDatabaseService.subscription.findUnique.mockResolvedValue(null);

    const response = await service.cancelSubscription(testUserId);

    expect(response.message).toBeDefined();
    expect(mockPolarService.cancelSubscription).not.toHaveBeenCalled();
  });

  it('should not cancel an inactive subscription', async () => {
    const testUserId = 'test-user-id';
    const subId = 'test-sub-id';

    mockDatabaseService.subscription.findUnique.mockResolvedValue({
      status: SubscriptionStatus.INACTIVE,
      provider: SubscriptionProvider.POLAR,
      provider_subscription_id: subId,
    });

    const response = await service.cancelSubscription(testUserId);

    expect(response.message).toBeDefined();
    expect(mockPolarService.cancelSubscription).not.toHaveBeenCalled();
  });

  it('should throw an error because subscription failed to be cancelled', async () => {
    const testUserId = 'test-user-id';
    const subId = 'test-sub-id';

    mockDatabaseService.subscription.findUnique.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      provider: SubscriptionProvider.POLAR,
      provider_subscription_id: subId,
    });

    mockPolarService.cancelSubscription.mockResolvedValue({
      success: false,
      error: new Error('fakse'),
    });

    await expect(service.cancelSubscription(testUserId)).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('should create the checkout url', async () => {
    const userId = 'test-user-id';
    const testProductId = 'test-product-id';

    mockDatabaseService.user.findUniqueOrThrow.mockResolvedValue({
      name: 'Test User',
      emai: 'test@email.com',
      id: userId,
      subscriptions: [{ status: SubscriptionStatus.INACTIVE }],
    });

    mockPolarService.getProduct.mockResolvedValue({
      success: true,
      data: true,
      error: null,
    });

    const checkoutUrl = 'test-url';

    mockPolarService.createCheckout.mockResolvedValue({
      success: true,
      data: { url: checkoutUrl },
      error: null,
    });

    const res = await service.createPolarCheckout(userId, {
      productId: testProductId,
    });

    expect(res.url).toEqual(checkoutUrl);
  });

  it('should not create the checkout url if product does not exist', async () => {
    const userId = 'test-user-id';
    const testProductId = 'test-product-id';

    mockDatabaseService.user.findUniqueOrThrow.mockResolvedValue({
      name: 'Test User',
      emai: 'test@email.com',
      id: userId,
      subscriptions: [{ status: SubscriptionStatus.INACTIVE }],
    });

    mockPolarService.getProduct.mockResolvedValue({
      success: true,
      data: null,
      error: null,
    });

    await expect(
      service.createPolarCheckout(userId, {
        productId: testProductId,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should not create the checkout url if user already has subscription', async () => {
    const userId = 'test-user-id';
    const testProductId = 'test-product-id';

    mockDatabaseService.user.findUniqueOrThrow.mockResolvedValue({
      name: 'Test User',
      emai: 'test@email.com',
      id: userId,
      subscriptions: [{ status: SubscriptionStatus.ACTIVE }],
    });

    await expect(
      service.createPolarCheckout(userId, {
        productId: testProductId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should get the polar plans', async () => {
    const prices = [
      { amountType: 'fixed', priceAmount: 20, priceCurrency: 'usd' },
    ];

    const result = {
      result: {
        pagination: { maxPagee: 1 },
        items: [{ id: 'test-value', recurringInterval: 'day', prices }],
      },
    };

    mockPolarService.getAvailableProducts.mockResolvedValue({
      success: true,
      data: result,
      error: null,
    });

    const res = await service.getPolarPlans();
    expect(res.data).toHaveLength(1);
  });
});
