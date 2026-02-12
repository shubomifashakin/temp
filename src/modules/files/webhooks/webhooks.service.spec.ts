import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { DatabaseService } from '../../../core/database/database.service';

const mockDatabaseService = {
  file: {
    updateMany: jest.fn(),
  },
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
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    await service.handleFileEvents({
      data: { key: 'test-key', safe: true },
      type: 'file:validated',
    });

    expect(mockDatabaseService.file.updateMany).toHaveBeenCalledWith({
      where: {
        s3_key: 'test-key',
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
        deleted_at: new Date(),
      },
    };

    await service.handleFileEvents({
      type: 'file:deleted',
      data: dto.data,
    });

    expect(mockDatabaseService.file.updateMany).toHaveBeenCalledWith({
      where: {
        s3_key: { in: ['test-key-1', 'test-key-2'] },
      },
      data: {
        deleted_at: dto.data.deleted_at,
      },
    });
  });
});
