import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';

import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  providers: [TasksService],
  imports: [DatabaseModule],
})
export class TasksModule {}
