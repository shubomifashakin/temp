import { Module } from '@nestjs/common';

import { WebhooksModule } from './webhooks/webhooks.module';

import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { PolarModule } from '../../core/polar/polar.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  imports: [WebhooksModule, DatabaseModule, PolarModule, RedisModule],
})
export class SubscriptionsModule {}
