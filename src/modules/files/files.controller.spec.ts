import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { FilesService } from './files.service';
import { FilesController } from './files.controller';

import { S3Module } from '../../core/s3/s3.module';
import { SqsModule } from '../../core/sqs/sqs.module';
import { RedisModule } from '../../core/redis/redis.module';
import { HasherModule } from '../../core/hasher/hasher.module';
import { DatabaseModule } from '../../core/database/database.module';

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService],
      controllers: [FilesController],
      imports: [
        DatabaseModule,
        RedisModule,
        S3Module,
        SqsModule,
        HasherModule,
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule,
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
