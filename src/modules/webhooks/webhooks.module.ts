import { Module } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { PolarModule } from '../../core/polar/polar.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [WebhooksService],
  controllers: [WebhooksController],
  imports: [DatabaseModule, RedisModule, PolarModule],
})
export class WebhooksModule {}
