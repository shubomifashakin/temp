import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { DatabaseModule } from '../../core/database/database.module';
import { RedisModule } from '../../core/redis/redis.module';

@Module({
  providers: [AuthService],
  controllers: [AuthController],
  imports: [DatabaseModule, RedisModule],
})
export class AuthModule {}
