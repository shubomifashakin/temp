import { Module } from '@nestjs/common';

import { LinksService } from './links.service';
import { LinksController } from './links.controller';

import { S3Module } from '../../core/s3/s3.module';
import { HasherModule } from '../../core/hasher/hasher.module';
import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';

@Module({
  controllers: [LinksController],
  providers: [LinksService],
  imports: [
    S3Module,
    RedisModule,
    HasherModule,
    DatabaseModule,
    AppConfigModule,
  ],
})
export class LinksModule {}
