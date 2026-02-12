import { Module } from '@nestjs/common';

import { WebhooksService } from './webhooks.service';

import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  providers: [WebhooksService],
  imports: [DatabaseModule],
})
export class WebhooksModule {}
