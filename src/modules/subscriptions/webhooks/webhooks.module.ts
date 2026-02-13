import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  imports: [DatabaseModule],
})
export class WebhooksModule {}
