import { Module } from '@nestjs/common';

import { WebhooksController } from './webhooks.controller';
import { PolarWebhooksService } from './polar-webhooks.service';

import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  controllers: [WebhooksController],
  providers: [PolarWebhooksService],
  imports: [DatabaseModule],
})
export class WebhooksModule {}
