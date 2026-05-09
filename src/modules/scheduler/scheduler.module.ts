import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [SchedulerService],
  imports: [DatabaseModule],
})
export class SchedulerModule {}
