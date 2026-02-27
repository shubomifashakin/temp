import { Module } from '@nestjs/common';

import { TasksModule } from './tasks/tasks.module';
import { WebhooksModule } from './webhooks/webhooks.module';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { LinksController } from './links/links.controller';
import { LinksService } from './links/links.service';

import { S3Module } from '../../core/s3/s3.module';
import { SqsModule } from '../../core/sqs/sqs.module';
import { RedisModule } from '../../core/redis/redis.module';
import { HasherModule } from '../../core/hasher/hasher.module';
import { DatabaseModule } from '../../core/database/database.module';
import { PrometheusModule } from '../../core/prometheus/prometheus.module';

@Module({
  providers: [FilesService, LinksService],
  controllers: [FilesController, LinksController],
  imports: [
    DatabaseModule,
    RedisModule,
    S3Module,
    SqsModule,
    HasherModule,
    WebhooksModule,
    PrometheusModule,
    TasksModule,
  ],
})
export class FilesModule {}
