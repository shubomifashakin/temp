import { Request } from 'express';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { WebhooksController } from './webhooks.controller';

import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarModule } from '../../../core/polar/polar.module';
import { DatabaseModule } from '../../../core/database/database.module';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const mockPolarWebhookEventService = {
  handleEvent: jest.fn(),
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

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: PolarWebhooksService,
          useValue: mockPolarWebhookEventService,
        },
      ],
      imports: [
        DatabaseModule,
        ConfigModule.forRoot({ isGlobal: true }),
        PolarModule,
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);

    module.useLogger(mockLogger);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call the polar handle event method', async () => {
    mockPolarWebhookEventService.handleEvent.mockResolvedValue({});
    await controller.handleEvent(mockRequest);

    expect(mockPolarWebhookEventService.handleEvent).toHaveBeenCalled();
    expect(mockPolarWebhookEventService.handleEvent).toHaveBeenCalledWith(
      testEventType,
      {},
      testTimestamp,
    );
  });
});
