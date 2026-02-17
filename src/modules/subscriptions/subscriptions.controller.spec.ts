import { Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { SubscriptionsController } from './subscriptions.controller';

import { SubscriptionsService } from './subscriptions.service';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';
import { Request, Response } from 'express';

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

const mockSubscriptionService = {
  cancelSubscription: jest.fn(),
  getPolarPlans: jest.fn(),
  createPolarCheckout: jest.fn(),
};

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: mockSubscriptionService },
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
    mockSubscriptionService.cancelSubscription.mockResolvedValue({
      message: 'Success',
    });

    const response = await controller.cancelSubscription(mockRequest);

    expect(response.message).toBeDefined();
  });

  it('should get the polar plans', async () => {
    mockSubscriptionService.getPolarPlans.mockResolvedValue({
      data: [{ amount_in_dollars: 0.2 }],
    });

    const res = await controller.getPolarPlans();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].amount_in_dollars).toBe(0.2);
  });

  it('should create the checkout url', async () => {
    mockSubscriptionService.createPolarCheckout.mockResolvedValue({
      url: 'test-url',
    });

    const productId = 'test-product-id';
    await controller.createPolarCheckout(mockRequest, mockResponse, {
      product_id: productId,
    });

    expect(mockResponse.redirect).toHaveBeenCalled();
    expect(mockResponse.redirect).toHaveBeenCalledTimes(1);
    expect(mockSubscriptionService.createPolarCheckout).toHaveBeenCalledWith(
      testUserId,
      { product_id: productId },
    );
  });
});
