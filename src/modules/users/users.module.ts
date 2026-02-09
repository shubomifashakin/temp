import { Module } from '@nestjs/common';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  imports: [DatabaseModule, RedisModule],
})
export class UsersModule {}
