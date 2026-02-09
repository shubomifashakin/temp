import { Module } from '@nestjs/common';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';

@Module({
  providers: [FilesService],
  controllers: [FilesController],
  imports: [DatabaseModule, RedisModule],
})
export class FilesModule {}
