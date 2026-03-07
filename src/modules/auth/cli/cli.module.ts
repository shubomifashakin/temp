import { Module } from '@nestjs/common';
import { CliController } from './cli.controller';
import { CliService } from './cli.service';

import { RedisModule } from '../../../core/redis/redis.module';
import { DatabaseModule } from '../../../core/database/database.module';

@Module({
  providers: [CliService],
  controllers: [CliController],
  imports: [DatabaseModule, RedisModule],
})
export class CliModule {}
