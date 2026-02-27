import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Cron('0 0 * * *', { name: 'metadata-cleanup', waitForCompletion: true })
  async handleMetdataCleanup() {
    this.logger.debug({ message: 'Starting metadata cleanup task' });

    const files = await this.databaseService.file.deleteMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        },
      },
      limit: 100,
    });

    this.logger.debug({
      message: 'Metadata cleanup task completed',
      filesDeleted: files.count,
    });
  }
}
