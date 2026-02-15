import { Request } from 'express';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { WebhooksController } from './webhooks.controller';

import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarModule } from '../../../core/polar/polar.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { DatabaseService } from '../../../core/database/database.service';

const mockDatabaseService = {
  subscription: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
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

const mockPolarEventService = {
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
        { provide: PolarWebhooksService, useValue: mockPolarEventService },
        { useValue: mockConfigService, provide: ConfigService },
        { useValue: mockDatabaseService, provide: DatabaseService },
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
    await controller.handleEvent(mockRequest);

    expect(mockPolarEventService.handleEvent).toHaveBeenCalled();
    expect(mockPolarEventService.handleEvent).toHaveBeenCalledWith(
      testEventType,
      {},
      testTimestamp,
    );
  });
});
