import { Module } from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { PolarModule } from '../../core/polar/polar.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  imports: [DatabaseModule, PolarModule, RedisModule],
})
export class SubscriptionsModule {}
