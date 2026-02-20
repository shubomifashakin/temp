import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';

const mockDatabaseService = {
  file: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockRedisService = {
  delete: jest.fn(),
};

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

    await service.handleFileEvents({
      data: { key: 'test-key', infected: false },
      type: 'file:validated',
    });

    expect(mockDatabaseService.file.update).toHaveBeenCalledWith({
      where: {
        s3Key: 'test-key',
      },
      data: {
        status: 'safe',
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

    await service.handleFileEvents({
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
