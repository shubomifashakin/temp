/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { TasksService } from './tasks.service';

import { DatabaseService } from '../../../core/database/database.service';
import { AppConfigService } from '../../../core/app-config/app-config.service';

const mockDatabaseService = {
  file: {
    deleteMany: jest.fn(),
  },
};

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        AppConfigService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
      imports: [ConfigModule.forRoot()],
    }).compile();

    service = module.get<TasksService>(TasksService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle metadata cleanup', async () => {
    mockDatabaseService.file.deleteMany.mockResolvedValueOnce({ count: 0 });

    await service.handleMetdataCleanup();
    expect(mockDatabaseService.file.deleteMany).toHaveBeenCalled();
    expect(mockDatabaseService.file.deleteMany).toHaveBeenCalledWith({
      where: {
        status: 'pending',
        createdAt: {
          lt: expect.any(Date),
        },
      },
      limit: 100,
    });
  });
});
