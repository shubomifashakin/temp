import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';
import { AppConfigModule } from '../../../core/app-config/app-config.module';

const mockDatabaseService = {
  file: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockRedisService = {
  delete: jest.fn(),
};

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      imports: [AppConfigModule],
      providers: [
        WebhooksService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    mockRedisService.delete.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.update.mockResolvedValue({
      id: 'test-id',
      s3Key: 'test-key',
      status: 'safe',
    });

    await controller.handleEvent({
      data: { key: 'test-key', infected: true },
      type: 'file:validated',
    });

    expect(mockDatabaseService.file.update).toHaveBeenCalledWith({
      where: {
        s3Key: 'test-key',
      },
      data: {
        status: 'unsafe',
      },
    });
  });

  it('should handle file:deleted event', async () => {
    const dto = {
      type: 'file:deleted',
      data: {
        keys: ['test-key-1', 'test-key-2'],
        deletedAt: new Date(),
      },
    };

    await controller.handleEvent({
      type: 'file:deleted',
      data: dto.data,
    });

    expect(mockDatabaseService.file.updateMany).toHaveBeenCalledWith({
      where: {
        s3Key: { in: ['test-key-1', 'test-key-2'] },
      },
      data: {
        deletedAt: dto.data.deletedAt,
      },
    });
  });
});
