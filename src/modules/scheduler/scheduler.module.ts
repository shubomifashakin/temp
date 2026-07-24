import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

import { S3Module } from '../../core/s3/s3.module';
import { SqsModule } from '../../core/sqs/sqs.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [SchedulerService],
  imports: [DatabaseModule, S3Module, SqsModule],
})
export class SchedulerModule {}
