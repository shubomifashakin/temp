import { Module } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  providers: [WebhooksService],
  imports: [DatabaseModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
