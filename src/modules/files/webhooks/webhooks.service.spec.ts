import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';

const mockDatabaseService = {
  file: {
    updateMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
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
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    mockRedisService.delete.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.findFirst.mockResolvedValue({ lastEvent: null });

    mockDatabaseService.file.update.mockResolvedValue({
      id: 'test-id',
      s3Key: 'test-key',
      status: 'safe',
    });

    const timestamp = new Date();
    await service.handleFileEvents({
      data: { key: 'test-key', infected: false },
      type: 'file:validated',
      timestamp,
    });

    expect(mockDatabaseService.file.update).toHaveBeenCalledWith({
      where: {
        s3Key: 'test-key',
      },
      data: {
        status: 'safe',
        lastEventAt: timestamp,
      },
    });
  });

  it('should not handle file:validated event if the file does not exist', async () => {
    mockRedisService.delete.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.findFirst.mockResolvedValue(null);

    mockDatabaseService.file.update.mockResolvedValue({
      id: 'test-id',
      s3Key: 'test-key',
      status: 'safe',
    });

    const timestamp = new Date();
    await service.handleFileEvents({
      data: { key: 'test-key', infected: false },
      type: 'file:validated',
      timestamp,
    });

    expect(mockDatabaseService.file.update).not.toHaveBeenCalled();
  });

  it('should not handle file:validated event if the event is old', async () => {
    mockRedisService.delete.mockResolvedValue({
      success: true,
      error: null,
    });

    mockDatabaseService.file.findFirst.mockResolvedValue({
      lastEventAt: new Date(),
    });

    mockDatabaseService.file.update.mockResolvedValue({
      id: 'test-id',
      s3Key: 'test-key',
      status: 'safe',
    });

    const timestamp = new Date(100);
    await service.handleFileEvents({
      data: { key: 'test-key', infected: false },
      type: 'file:validated',
      timestamp,
    });

    expect(mockDatabaseService.file.update).not.toHaveBeenCalled();
  });

  it('should handle file:deleted event', async () => {
    const dto = {
      type: 'file:deleted',
      data: {
        keys: ['test-key-1', 'test-key-2'],
        deletedAt: new Date(),
      },
    };

    mockDatabaseService.file.findMany.mockResolvedValue([]);

    const timestamp = new Date();
    await service.handleFileEvents({
      type: 'file:deleted',
      data: dto.data,
      timestamp,
    });

    expect(mockDatabaseService.file.updateMany).toHaveBeenCalledWith({
      where: {
        s3Key: { in: ['test-key-1', 'test-key-2'] },
      },
      data: {
        deletedAt: dto.data.deletedAt,
        lastEventAt: timestamp,
      },
    });
  });
});
