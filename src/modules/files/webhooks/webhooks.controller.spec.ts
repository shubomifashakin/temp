import { Test, TestingModule } from '@nestjs/testing';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { DatabaseService } from '../../../core/database/database.service';
import { ConfigModule } from '@nestjs/config';

const mockDatabaseService = {
  file: {
    updateMany: jest.fn(),
  },
};

describe('WebhooksController', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      imports: [ConfigModule],
      providers: [
        WebhooksService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle file:validated event', async () => {
    await controller.handleEvent({
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

    await controller.handleEvent({
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
