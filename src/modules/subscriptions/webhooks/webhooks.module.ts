import { Module } from '@nestjs/common';

import { WebhooksController } from './webhooks.controller';
import { PolarWebhooksService } from './polar-webhooks.service';

import { PolarModule } from '../../../core/polar/polar.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [WebhooksController],
  providers: [PolarWebhooksService],
  imports: [DatabaseModule, PolarModule, ConfigModule],
})
export class WebhooksModule {}
