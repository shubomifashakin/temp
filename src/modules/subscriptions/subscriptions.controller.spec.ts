import { Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { SubscriptionsController } from './subscriptions.controller';

import { SubscriptionsService } from './subscriptions.service';

//FIXME: MAKE IT A SERVICE
process.env.POLAR_PRODUCT_PRO = 'test-value';

import { RedisModule } from '../../core/redis/redis.module';
import { PolarService } from '../../core/polar/polar.service';
import { DatabaseService } from '../../core/database/database.service';
import { DatabaseModule } from '../../core/database/database.module';
import {
  SubscriptionStatus,
  SubscriptionProvider,
} from '../../../generated/prisma/enums';
import { Request, Response } from 'express';

const mockDatabaseService = {
  subscription: {
    findFirst: jest.fn(),
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

const testUserId = 'test-user-id';
const mockRequest = {
  user: {
    id: testUserId,
  },
} as Request;

const mockResponse = {
  redirect: jest.fn(),
} as unknown as jest.Mocked<Response>;

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        SubscriptionsService,
        { useValue: mockPolarService, provide: PolarService },
        { useValue: mockConfigService, provide: ConfigService },
        { useValue: mockDatabaseService, provide: DatabaseService },
      ],
      imports: [
        JwtModule,
        RedisModule,
        DatabaseModule,
        ConfigModule.forRoot({ isGlobal: true }),
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);

    module.useLogger(mockLogger);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should cancel the subscription', async () => {
    const subId = 'test-sub-id';

    mockDatabaseService.subscription.findFirst.mockResolvedValue({
      status: SubscriptionStatus.ACTIVE,
      provider: SubscriptionProvider.POLAR,
      provider_subscription_id: subId,
      cancelled_at: null,
      cancel_at_period_end: false,
    });

    mockPolarService.cancelSubscription.mockResolvedValue({
      success: true,
      error: false,
    });

    const response = await controller.cancelSubscription(mockRequest);

    expect(response.message).toBeDefined();
  });

  it('should get the polar plans', async () => {
    const prices = [
      { amountType: 'fixed', priceAmount: 20, priceCurrency: 'usd' },
    ];

    const result = {
      result: {
        pagination: { maxPagee: 1 },
        items: [
          {
            id: 'test-value',
            recurringInterval: 'day',
            prices,
            isRecurring: true,
          },
        ],
      },
    };

    mockPolarService.getAvailableProducts.mockResolvedValue({
      success: true,
      data: result,
      error: null,
    });

    const res = await controller.getPolarPlans();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].amount_in_dollars).toBe(0.2);
  });

  it('should create the checkout url', async () => {
    const userId = 'test-user-id';
    const testProductId = 'test-product-id';

    mockDatabaseService.user.findUniqueOrThrow.mockResolvedValue({
      name: 'Test User',
      emai: 'test@email.com',
      id: userId,
    });

    mockDatabaseService.subscription.findFirst.mockResolvedValue(null);

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

    await controller.createPolarCheckout(mockRequest, mockResponse, {
      product_id: testProductId,
    });

    expect(mockResponse.redirect).toHaveBeenCalled();
    expect(mockResponse.redirect).toHaveBeenCalledTimes(1);
    expect(mockPolarService.getProduct).toHaveBeenCalledWith({
      productId: testProductId,
    });
  });
});
