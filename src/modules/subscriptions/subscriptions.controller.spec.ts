/* eslint-disable @typescript-eslint/unbound-method */
import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { SubscriptionsController } from './subscriptions.controller';

import { SubscriptionsService } from './subscriptions.service';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

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

const mockAppConfigService = {
  RedisUrl: {
    data: undefined,
    success: true,
  },
  DatabaseUrl: {
    data: undefined,
    success: true,
  },
};

const mockSubscriptionService = {
  cancelSubscription: jest.fn(),
  getPlans: jest.fn(),
  createCheckout: jest.fn(),
};

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: mockSubscriptionService },
      ],
      imports: [JwtModule, RedisModule, DatabaseModule, AppConfigModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);

    module.useLogger(mockLogger);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should cancel the subscription', async () => {
    mockSubscriptionService.cancelSubscription.mockResolvedValue({
      message: 'Success',
    });

    const response = await controller.cancelSubscription(mockRequest);

    expect(response.message).toBeDefined();
  });

  it('should get the polar plans', async () => {
    mockSubscriptionService.getPlans.mockResolvedValue({
      data: {
        month: [{ currency: 'usd', plans: [{ amount: 0.2 }] }],
        year: [],
      },
    });

    const res = await controller.getPlans();
    expect(res.data.month).toHaveLength(1);
    expect(res.data.month[0].plans[0].amount).toBe(0.2);
  });

  it('should create the checkout url', async () => {
    mockSubscriptionService.createCheckout.mockResolvedValue({
      url: 'test-url',
    });

    const productId = 'test-product-id';
    await controller.createCheckout(mockRequest, mockResponse, {
      product_id: productId,
      provider: 'polar',
    });

    expect(mockResponse.redirect).toHaveBeenCalled();
    expect(mockResponse.redirect).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionService.createCheckout).toHaveBeenCalledWith(
      testUserId,
      { product_id: productId, provider: 'polar' },
    );
  });
});
