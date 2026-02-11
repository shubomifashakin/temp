import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { FilesService } from './files.service';

import { S3Module } from '../../core/s3/s3.module';
import { SqsModule } from '../../core/sqs/sqs.module';
import { RedisModule } from '../../core/redis/redis.module';
import { HasherModule } from '../../core/hasher/hasher.module';
import { DatabaseModule } from '../../core/database/database.module';

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService],
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule,
        S3Module,
        SqsModule,
        RedisModule,
        HasherModule,
        DatabaseModule,
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
