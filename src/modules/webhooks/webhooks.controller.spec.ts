import { Request } from 'express';

import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { PolarModule } from '../../core/polar/polar.module';
import { DatabaseModule } from '../../core/database/database.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

const mockWebhooksService = {
  handleFileEvents: jest.fn(),
  handlePolarEvent: jest.fn(),
};

const testTimestamp = new Date();
const testEventType = 'subscription.active';
const mockRequest = {
  polarEvent: {
    timestamp: testTimestamp,
    type: testEventType,
    data: {},
  },
} as jest.Mocked<Request>;

const mockAppConfigService = {
  RedisUrl: {
    data: undefined,
    success: true,
  },
  DatabaseUrl: {
    data: undefined,
    success: true,
  },
  PolarAccessToken: {
    data: 'test-value',
    success: true,
  },
  NodeEnv: {
    data: 'test-value',
    success: true,
  },
  ServiceName: {
    data: 'test-service',
    success: true,
  },
};

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      imports: [AppConfigModule, PolarModule, DatabaseModule],
      providers: [
        {
          provide: WebhooksService,
          useValue: mockWebhooksService,
        },
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    mockWebhooksService.handleFileEvents.mockResolvedValue({
      message: 'success',
    });

    await controller.handleFileEvent({
      data: { key: 'test-key', infected: true },
      type: 'file:validated',
      timestamp: new Date(),
    });

    expect(mockWebhooksService.handleFileEvents).toHaveBeenCalled();
  });

  it('should handle file:deleted event', async () => {
    mockWebhooksService.handleFileEvents.mockResolvedValue({
      message: 'success',
    });

    const dto = {
      type: 'file:deleted',
      data: {
        keys: ['test-key-1', 'test-key-2'],
        deletedAt: new Date(),
      },
    };

    const res = await controller.handleFileEvent({
      type: 'file:deleted',
      data: dto.data,
      timestamp: new Date(),
    });

    expect(res).toEqual({ message: 'success' });
  });

  it('should call the polar handle event method', async () => {
    mockWebhooksService.handleFileEvents.mockResolvedValue({});
    await controller.handlePolarEvent(mockRequest);

    expect(mockWebhooksService.handlePolarEvent).toHaveBeenCalled();
    expect(mockWebhooksService.handlePolarEvent).toHaveBeenCalledWith(
      testEventType,
      {},
      testTimestamp,
    );
  });
});
