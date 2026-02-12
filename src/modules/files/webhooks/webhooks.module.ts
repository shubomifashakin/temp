import { Module } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

import { DatabaseModule } from '../../../core/database/database.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  providers: [WebhooksService],
  imports: [DatabaseModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
