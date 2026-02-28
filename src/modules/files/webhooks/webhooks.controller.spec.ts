import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { AppConfigModule } from '../../../core/app-config/app-config.module';

const mockWebhooksService = {
  handleFileEvents: jest.fn(),
};

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      imports: [AppConfigModule],
      providers: [
        {
          provide: WebhooksService,
          useValue: mockWebhooksService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    mockWebhooksService.handleFileEvents.mockResolvedValue({
      message: 'success',
    });

    await controller.handleEvent({
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

    const res = await controller.handleEvent({
      type: 'file:deleted',
      data: dto.data,
      timestamp: new Date(),
    });

    expect(res).toEqual({ message: 'success' });
  });
});
